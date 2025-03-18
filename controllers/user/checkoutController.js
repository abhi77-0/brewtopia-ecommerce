const Razorpay = require('razorpay');
const crypto = require('crypto');
const Cart = require('../../models/shopingCart');
const User = require('../../models/userModel');
const Order = require('../../models/Order');
const Product = require('../../models/product');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

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
        const { amount } = req.body;
        const options = {
            amount: amount * 100, // Razorpay expects amount in paise
            currency: "INR",
            receipt: "order_" + Date.now(),
        };

        const order = await razorpay.orders.create(options);
        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order'
        });
    }
};

// Verify Razorpay payment
exports.verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = req.body;

        // Verify signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature === expectedSign) {
            // Update order status
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: 'Completed',
                paymentId: razorpay_payment_id,
                status: 'Confirmed'
            });

            return res.json({
                success: true,
                message: "Payment verified successfully"
            });
        } else {
            await Order.findByIdAndUpdate(orderId, {
                paymentStatus: 'Failed',
                status: 'Payment Failed'
            });

            return res.json({
                success: false,
                message: "Payment verification failed"
            });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: "Payment verification failed"
        });
    }
};

// Payment success page
exports.paymentSuccess = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId)
            .populate('items.product');

        res.render('cart/payment-success', {
            title: 'Payment Successful',
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading success page:', error);
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