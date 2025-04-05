const Razorpay = require('razorpay');
const crypto = require('crypto');
const Cart = require('../../models/shopingCart');
const User = require('../../models/userModel');
const Order = require('../../models/Order');
const Coupon = require('../../models/Coupon');
const Product = require('../../models/product');
const Address = require('../../models/Address');
const Wallet = require('../../models/walletModel');
const { updateCouponUsage } = require('../../utils/couponUtils');

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

// Add the calculateBestOffer function at the top of the file
const calculateBestOffer = (product) => {
    try {
        let bestOffer = null;
        let discountPercentage = 0;

        const now = new Date();

        // Check product offer
        if (product.offer && 
            product.offer.isActive !== false && 
            now >= new Date(product.offer.startDate) && 
            now <= new Date(product.offer.endDate)) {
            bestOffer = product.offer;
            discountPercentage = product.offer.discountPercentage;
        }

        // Check category offer
        if (product.categoryOffer && 
            product.categoryOffer.isActive !== false && 
            now >= new Date(product.categoryOffer.startDate) && 
            now <= new Date(product.categoryOffer.endDate)) {
            
            // Use category offer if it's better than product offer
            if (!bestOffer || product.categoryOffer.discountPercentage > discountPercentage) {
                bestOffer = product.categoryOffer;
                discountPercentage = product.categoryOffer.discountPercentage;
            }
        }

        return {
            bestOffer,
            discountPercentage: parseFloat(discountPercentage) || 0
        };
    } catch (error) {
        console.error('Error calculating best offer:', error);
        return {
            bestOffer: null,
            discountPercentage: 0
        };
    }
};

// Get checkout page
exports.getCheckout = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40
        const gstRate = 0.18;

        // Find or create wallet for the user
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: 0,
                transactions: []
            });
            await wallet.save();
            
            // Update user with wallet reference
            await User.findByIdAndUpdate(userId, { wallet: wallet._id });
        }

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand offer categoryOffer isVisible isDeleted',
                populate: [
                    { path: 'offer' },
                    { path: 'categoryOffer' }
                ]
            });
        
        // Filter out products that are not visible or are deleted
        if (cart) {
            cart.items = cart.items.filter(item => 
                item.product && 
                item.product.isVisible === true &&
                item.product.isDeleted !== true
            );
            
            // Save the cart if any items were filtered out
            await cart.save();
        }
        
        // Get user details with populated addresses
        const user = await User.findById(userId)
            .populate('addresses');
        
        if (!cart || cart.items.length === 0) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }

        // Calculate totals with only visible products
        cart.items.forEach(item => {
            if (item.product && item.product.variants && item.variant) {
                const variantPrice = item.product.variants[item.variant]?.price || 0;
                item.total = variantPrice * item.quantity;
                subtotal += item.total;
                itemCount += item.quantity;
            }
        });

        
        const gst = Math.round(subtotal * gstRate);
        const total = subtotal + shipping + gst;

        // Get the default or first address
        const defaultAddress = user.addresses && user.addresses.length > 0 
            ? user.addresses[0] 
            : null;

        console.log('Wallet balance:', wallet.balance); // Debug log

        res.render('cart/checkout', {
            title: 'Checkout',
            cart,
            user,
            defaultAddress,
            subtotal,
            shipping,
            gst,
            total: Math.round(total),
            itemCount,
            walletBalance: wallet.balance, // Use wallet directly
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            calculateBestOffer
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
                select: 'name description images variants brand isVisible isDeleted'
            });
            
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }
        
        // Filter out products that are not visible or are deleted
        cart.items = cart.items.filter(item => 
            item.product && 
            item.product.isVisible === true &&
            item.product.isDeleted !== true
        );
        
        // If all products were filtered out, return error
        if (cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'All products in your cart are currently unavailable'
            });
        }
        
        // Save the filtered cart
        await cart.save();
        
        // Calculate totals
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40;
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
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId } = req.body;
        
        // Get user ID from session
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }
        
        // Verify the payment signature
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');
            
        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }
        
        // Get cart details with populated product details including offers
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                populate: [
                    { path: 'offer' },
                    { path: 'categoryOffer' }
                ]
            });
            
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Get address details
        const address = await Address.findById(addressId);
        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Delivery address not found'
            });
        }
        
        // Calculate subtotal and prepare order items
        let subtotal = 0;
        const orderItems = cart.items.map(item => {
            const price = item.product.variants[item.variant].price;
            subtotal += price * item.quantity;
            
            return {
                product: item.product._id,
                variant: item.variant,
                price: price,
                quantity: item.quantity
            };
        });
        
        // Calculate shipping fee
        const shippingFee = subtotal >= 1000 ? 0 : 40;
        
        // Calculate GST (18%)
        const gst = Math.round(subtotal * 0.18);
        
        // Calculate offer discount
        let offerDiscount = 0;
        for (const item of cart.items) {
            // Get the best offer (product or category)
            let discountPercentage = 0;
            
            if (item.product.offer && item.product.offer.isActive !== false && 
                new Date() >= new Date(item.product.offer.startDate) && 
                new Date() <= new Date(item.product.offer.endDate)) {
                discountPercentage = Math.max(discountPercentage, item.product.offer.discountPercentage);
            }
            
            if (item.product.categoryOffer && item.product.categoryOffer.isActive !== false && 
                new Date() >= new Date(item.product.categoryOffer.startDate) && 
                new Date() <= new Date(item.product.categoryOffer.endDate)) {
                discountPercentage = Math.max(discountPercentage, item.product.categoryOffer.discountPercentage);
            }
            
            if (discountPercentage > 0) {
                const itemPrice = item.product.variants[item.variant].price;
                const itemTotal = itemPrice * item.quantity;
                offerDiscount += itemTotal * (discountPercentage / 100);
            }
        }
        offerDiscount = Math.round(offerDiscount);
        
        // Get coupon discount from session if exists
        let couponDiscount = 0;
        let couponCode = null;
        let couponId = null;
        
        if (req.session.coupon) {
            couponDiscount = req.session.coupon.discountAmount || 0;
            couponCode = req.session.coupon.code;
            couponId = req.session.coupon.couponId;
        }
        
        // Calculate total
        const total = subtotal + shippingFee + gst - offerDiscount - couponDiscount;
        
        // Calculate expected delivery date (e.g., 7 days from now)
        const expectedDeliveryDate = new Date();
        expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);
        
        // Create the order with all discount information
        const order = new Order({
            user: userId,
            items: orderItems,
            address: addressId,
            paymentMethod: 'razorpay',
            paymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            status: 'Processing',
            paymentStatus: 'Completed',
            expectedDeliveryDate: expectedDeliveryDate,
            subtotal: subtotal,
            shippingFee: shippingFee,
            offerDiscount: offerDiscount,
            couponDiscount: couponDiscount,
            gst: gst,
            total: Math.round(total)
        });
        
        // Add coupon data if exists
        if (couponId) {
            order.coupon = {
                code: couponCode,
                discount: couponDiscount,
                couponId: couponId
            };
        }
        
        // Calculate and set proper discount values for each item
        if (order && order.items && Array.isArray(order.items)) {
            // Get cart to access product details with offers
            const cart = await Cart.findOne({ user: userId })
                .populate({
                    path: 'items.product',
                    model: 'Product',
                    populate: [
                        { path: 'offer' },
                        { path: 'categoryOffer' }
                    ]
                });
            
            if (cart && cart.items) {
                // Calculate total cart value for coupon distribution
                const cartTotal = cart.items.reduce((sum, item) => {
                    const price = item.product.variants[item.variant].price;
                    return sum + (price * item.quantity);
                }, 0);
                
                // Get coupon discount from session if exists
                let totalCouponDiscount = 0;
                if (req.session.coupon) {
                    totalCouponDiscount = req.session.coupon.discountAmount || 0;
                }
                
                // Map cart items to order items by product ID and variant
                for (let i = 0; i < order.items.length; i++) {
                    const orderItem = order.items[i];
                    const cartItem = cart.items.find(item => 
                        item.product._id.toString() === orderItem.product.toString() && 
                        item.variant === orderItem.variant
                    );
                    
                    if (cartItem) {
                        // Calculate offer discount
                        let discountPercentage = 0;
                        
                        if (cartItem.product.offer && cartItem.product.offer.isActive !== false && 
                            new Date() >= new Date(cartItem.product.offer.startDate) && 
                            new Date() <= new Date(cartItem.product.offer.endDate)) {
                            discountPercentage = Math.max(discountPercentage, cartItem.product.offer.discountPercentage);
                        }
                        
                        if (cartItem.product.categoryOffer && cartItem.product.categoryOffer.isActive !== false && 
                            new Date() >= new Date(cartItem.product.categoryOffer.startDate) && 
                            new Date() <= new Date(cartItem.product.categoryOffer.endDate)) {
                            discountPercentage = Math.max(discountPercentage, cartItem.product.categoryOffer.discountPercentage);
                        }
                        
                        if (discountPercentage > 0) {
                            const itemPrice = orderItem.price;
                            const itemTotal = itemPrice * orderItem.quantity;
                            orderItem.offerDiscount = Math.round(itemTotal * (discountPercentage / 100));
                        }
                        
                        // Calculate coupon discount (proportional distribution)
                        if (totalCouponDiscount > 0) {
                            const itemPrice = orderItem.price;
                            const itemTotal = itemPrice * orderItem.quantity;
                            const proportion = itemTotal / cartTotal;
                            orderItem.couponDiscount = Math.round(totalCouponDiscount * proportion);
                        }
                        
                        // Set originalPrice and finalPrice
                        orderItem.originalPrice = orderItem.price;
                        const totalDiscount = (orderItem.offerDiscount || 0) + (orderItem.couponDiscount || 0);
                        const perUnitDiscount = orderItem.quantity > 0 ? totalDiscount / orderItem.quantity : 0;
                        orderItem.finalPrice = Math.max(0, orderItem.price - perUnitDiscount);
                    }
                }
            } else {
                // Fallback if cart not found - set required fields with default values
                for (let i = 0; i < order.items.length; i++) {
                    order.items[i].originalPrice = order.items[i].price;
                    order.items[i].finalPrice = order.items[i].price;
                }
            }
        }
        
        await order.save();
        
        // Update coupon usage if a coupon was used
        if (req.session.coupon) {
            await updateCouponUsage(userId, req.session.coupon);
            delete req.session.coupon;
        }
        
        // Clear the cart
        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [] } }
        );
        
        res.status(200).json({
            success: true,
            message: 'Payment verified and order placed successfully',
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

exports.applyCoupon = async (req, res) => {
    try {
        const { couponCode } = req.body;
        const cart = await Cart.findOne({ user: req.user._id })
            .populate({
                path: 'items.product',
                model: 'Product'
            });

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Calculate cart subtotal
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.product.variants[item.variant].price * item.quantity);
        }, 0);

        // Find valid coupon
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            isActive: true,
            startDate: { $lte: new Date() },
            endDate: { $gte: new Date() },
            usageLimit: { $gt: 0 }
        });

        if (!coupon) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired coupon code'
            });
        }

        // Check minimum purchase requirement
        if (subtotal < coupon.minimumPurchase) {
            return res.status(400).json({
                success: false,
                message: `Minimum purchase of ₹${coupon.minimumPurchase} required`            });
        }

        // Calculate discount
        let discountAmount;
        if (coupon.discountType === 'percentage') {
            discountAmount = (subtotal * coupon.discountAmount) / 100;
            if (coupon.maxDiscount) {
                discountAmount = Math.min(discountAmount, coupon.maxDiscount);
            }
        } else {
            discountAmount = coupon.discountAmount;
        }

        // Store coupon in session
        req.session.coupon = {
            code: coupon.code,
            discountAmount: discountAmount
        };

        // Calculate final amounts
        const shipping = 40; // Your shipping calculation
        const total = subtotal + shipping - discountAmount;

        res.json({
            success: true,
            message: 'Coupon applied successfully',
            data: {
                subtotal,
                shipping,
                discount: discountAmount,
                total: Math.max(0, total),
                couponCode: coupon.code
            }
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply coupon'
        });
    }
};

exports.removeCoupon = async (req, res) => {
    try {
        // Remove coupon from session
        req.session.coupon = null;

        const cart = await Cart.findOne({ user: req.user._id })
            .populate({
                path: 'items.product',
                model: 'Product'
            });
        
        // Recalculate totals without coupon
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.product.variants[item.variant].price * item.quantity);
        }, 0);

        const shipping = 40; // Your shipping calculation
        const total = subtotal + shipping;

        res.json({
            success: true,
            message: 'Coupon removed successfully',
            data: {
                subtotal,
                shipping,
                discount: 0,
                total
            }
        });

    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove coupon'
        });
    }
}

exports.availableCoupons = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        console.log('Fetching coupons for user:', userId);
        
        // Get the cart to check total amount
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });
            
        if (!cart) {
            console.log('Cart not found for user:', userId);
            return res.status(400).json({
                success: false,
                message: 'Cart not found'
            });
        }
        
        // Calculate cart subtotal
        let subtotal = 0;
        cart.items.forEach(item => {
            if (item.product && item.product.variants && item.variant) {
                const variantPrice = item.product.variants[item.variant]?.price || 0;
                subtotal += variantPrice * item.quantity;
            }
        });
        console.log('Cart subtotal:', subtotal);
        
        // Find all active coupons regardless of minimum purchase
        const activeCoupons = await Coupon.find({
            isActive: true,
            endDate: { $gt: new Date() },
            startDate: { $lte: new Date() }
        });
        
        console.log('Active non-expired coupons:', activeCoupons.length);
        
        // Return all active coupons
        res.json({
            success: true,
            coupons: activeCoupons,
            cartSubtotal: subtotal
        });
        
    } catch (error) {
        console.error('Error fetching available coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch coupons',
            error: error.message
        });
    }
};

// Display available coupons page
exports.showAvailableCoupons = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        console.log('Fetching coupons for user:', userId);
        
        // Get the cart to check total amount
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });
            
        if (!cart) {
            req.flash('error', 'Please add items to your cart first');
            return res.redirect('/cart');
        }
        
        // Calculate cart subtotal
        let subtotal = 0;
        cart.items.forEach(item => {
            if (item.product && item.product.variants && item.variant) {
                const variantPrice = item.product.variants[item.variant]?.price || 0;
                subtotal += variantPrice * item.quantity;
            }
        });
        
        // Find all active coupons
        const activeCoupons = await Coupon.find({
            isActive: true,
            endDate: { $gt: new Date() },
            startDate: { $lte: new Date() }
        });
        
        console.log('Active non-expired coupons:', activeCoupons.length);
        
        // Render the coupons page from the users folder
        res.render('users/coupons', {
            title: 'Available Coupons',
            coupons: activeCoupons,
            cartSubtotal: subtotal,
            user: req.session.user
        });
        
    } catch (error) {
        console.error('Error fetching available coupons:', error);
        req.flash('error', 'Failed to fetch coupons');
        res.redirect('/cart');
    }
};
