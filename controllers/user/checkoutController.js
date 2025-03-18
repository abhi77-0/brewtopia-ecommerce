const Razorpay = require('razorpay');
const crypto = require('crypto');
const Cart = require('../../models/shopingCart');
const User = require('../../models/userModel');
const Order = require('../../models/Order');
const Product = require('../../models/product');

// Initialize Razorpay with error handling
let razorpay;
try {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
} catch (error) {
    console.error('Razorpay initialization error:', error);
}

// Get checkout page
exports.getCheckout = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40;
        const discountRate = 0.10;
        const gstRate = 0.18;

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });
        
        // Get user details with populated addresses
        const user = await User.findById(userId)
            .populate('addresses');
        
        if (!cart || cart.items.length === 0) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }

        // Calculate totals
        cart.items.forEach(item => {
            if (item.product && item.product.variants && item.variant) {
                const variantPrice = item.product.variants[item.variant]?.price || 0;
                item.total = variantPrice * item.quantity;
                subtotal += item.total;
                itemCount += item.quantity;
            }
        });

        const discount = subtotal * discountRate;
        const gst = Math.round(subtotal * gstRate);
        const total = subtotal + shipping - discount + gst;

        // Get the default or first address
        const defaultAddress = user.addresses && user.addresses.length > 0 
            ? user.addresses[0] 
            : null;

        res.render('cart/checkout', {
            title: 'Checkout',
            cart,
            user,
            defaultAddress,
            subtotal,
            shipping,
            discount: Math.round(discount),
            gst,
            total: Math.round(total),
            itemCount,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Error getting checkout page:', error);
        req.flash('error', 'Error accessing checkout');
        res.redirect('/cart');
    }
};

// Process checkout
exports.processCheckout = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        const { shippingAddress, paymentMethod, paymentId } = req.body;
        
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });
            
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }
        
        // Calculate totals
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40;
        const discountRate = 0.10;
        const gstRate = 0.18;
        
        // Verify stock and prepare order items
        let orderItems = [];
        let stockUpdateOperations = [];
        
        for (const item of cart.items) {
            const product = item.product;
            const variant = item.variant;
            const quantity = item.quantity;
            
            if (!product || !product.variants || !product.variants[variant]) {
                return res.status(400).json({
                    success: false,
                    message: `Product ${product ? product.name : 'Unknown'} with variant ${variant} is not available`
                });
            }
            
            if (product.variants[variant].stock < quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for ${product.name} (${variant})`
                });
            }
            
            const price = product.variants[variant].price;
            subtotal += price * quantity;
            itemCount += quantity;
            
            orderItems.push({
                product: product._id,
                name: product.name,
                variant,
                quantity,
                price
            });
            
            // Prepare stock update operation - can be used to batch update stock later
            const updatePath = `variants.${variant}.stock`;
            stockUpdateOperations.push({
                updateOne: {
                    filter: { _id: product._id },
                    update: { $inc: { [updatePath]: -quantity } }
                }
            });
        }
        
        const discount = subtotal * discountRate;
        const gst = Math.round(subtotal * gstRate);
        const total = subtotal + shipping - discount + gst;
        
        // Create and save the order
        const order = await Order.create({
            user: userId,
            items: orderItems,
            subtotal,
            shipping,
            discount: Math.round(discount),
            gst,
            total: Math.round(total),
            shippingAddress,
            paymentMethod,
            paymentId,
            status: 'Pending',
            paymentStatus: 'Pending'
        });

        // Update product stock
        if (stockUpdateOperations.length > 0) {
            await Product.bulkWrite(stockUpdateOperations);
        }

        // Clear the cart
        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [] } }
        );
        
        res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: order._id
        });
        
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during checkout',
            error: error.message
        });
    }
};

// Order confirmation page
exports.orderConfirmation = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user?._id || req.session.user?.id;
        
        const order = await Order.findOne({ 
            _id: orderId, 
            user: userId 
        }).populate({
            path: 'items.product',
            model: 'Product',
            select: 'name images'
        });
        
        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }
        
        res.render('cart/order-confirmation', {
            title: 'Order Confirmation',
            order,
            user: req.session.user
        });
        
    } catch (error) {
        console.error('Error loading order confirmation:', error);
        req.flash('error', 'Error loading order confirmation');
        res.redirect('/orders');
    }
};

// Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
    try {
        // Debug logs
        console.log('Request body:', req.body);
        console.log('User session:', req.session);
        console.log('Razorpay credentials:', {
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET ? 'Present' : 'Missing'
        });

        // Validate Razorpay initialization
        if (!razorpay) {
            throw new Error('Razorpay is not properly initialized');
        }

        const { amount } = req.body;

        // Validate amount
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount provided'
            });
        }

        const options = {
            amount: Math.round(amount * 100), // amount in paise
            currency: "INR",
            receipt: `order_${Date.now()}`,
            payment_capture: 1
        };

        console.log('Creating Razorpay order with options:', options);

        const order = await razorpay.orders.create(options);
        console.log('Razorpay order created:', order);

        return res.status(200).json({
            success: true,
            order: order
        });

    } catch (error) {
        console.error('Detailed error in createRazorpayOrder:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            addressId
        } = req.body;

        // Verify the payment signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (!isAuthentic) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        // Get cart data
        const cart = await Cart.findOne({ user: req.user._id })
            .populate('items.product');

        if (!cart) {
            return res.status(400).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Calculate order total
        const orderItems = cart.items.map(item => ({
            product: item.product._id,
            variant: item.variant,
            quantity: item.quantity,
            price: item.product.variants[item.variant].price
        }));

        // Calculate total
        const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingFee = 40; // or your shipping fee logic
        const discount = subtotal * 0.1; // 10% discount or your discount logic
        const total = subtotal + shippingFee - discount;

        // Calculate expected delivery date (7 days from now)
        const expectedDeliveryDate = new Date();
        expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);

        // Create order data
        const orderData = {
            user: req.user._id,
            items: orderItems,
            address: addressId,
            total: Math.round(total), // Round to avoid decimal issues
            status: 'Processing',
            paymentMethod: 'razorpay',
            paymentStatus: 'Completed',
            expectedDeliveryDate: expectedDeliveryDate
        };

        console.log('Creating order with data:', orderData); // Debug log

        // Create the order
        const order = await Order.create(orderData);

        // Clear the cart after successful order
        await Cart.findOneAndDelete({ user: req.user._id });

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            orderId: order._id
        });

    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            error: error.message
        });
    }
};

// Payment success page
exports.paymentSuccess = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('items.product')
            .populate('address')
            .populate('user')
            .exec();

        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        res.render('cart/payment-success', {
            title: 'Payment Success',
            order: order
        });

    } catch (error) {
        console.error('Error in payment success page:', error);
        req.flash('error', 'Error loading order details');
        res.redirect('/orders');
    }
};

// Payment failure page
exports.paymentFailure = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId)
            .populate('items.product');

        res.render('cart/payment-failure', {
            title: 'Payment Failed',
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading failure page:', error);
        res.redirect('/orders');
    }
};

// Retry payment
exports.retryPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Create new Razorpay order
        const options = {
            amount: order.total * 100,
            currency: "INR",
            receipt: "retry_" + orderId,
        };

        const razorpayOrder = await razorpay.orders.create(options);
        res.json({
            success: true,
            order: razorpayOrder
        });
    } catch (error) {
        console.error('Error retrying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retry payment'
        });
    }
};