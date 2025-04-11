const Order = require('../../models/Order');
const Cart = require('../../models/shopingCart');
const User = require('../../models/userModel');
const Product = require('../../models/product');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Address = require('../../models/Address');
const Wallet = require('../../models/walletModel');
const Coupon = require('../../models/Coupon');
const { updateCouponUsage } = require('../../utils/couponUtils');
const crypto = require('crypto');

const orderController = {
    placeOrder: async (req, res) => {
        try {
            console.log('Starting place order process...');
            
            const { addressId, paymentMethod } = req.body;
            
            // Get user ID from either req.user or req.session.user
            const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
            
            if (!userId) {
                console.log('User not authenticated:', { user: req.user, session: req.session });
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }
            
            // Find the cart for the user with populated product details
            const cart = await Cart.findOne({ user: userId })
                .populate({
                    path: 'items.product',
                    model: 'Product',
                    populate: [
                        { path: 'offer' },
                        { path: 'categoryOffer' }
                    ]
                });
            
            if (!cart || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cart is empty'
                });
            }
            
            // Get the shipping address
            const address = await Address.findById(addressId);
            
            if (!address) {
                return res.status(400).json({
                    success: false,
                    message: 'Shipping address not found'
                });
            }
            
            // Calculate subtotal and prepare order items with detailed discount information
            let subtotal = 0;
            let totalOfferDiscount = 0;
            const orderItems = [];
            
            // Process each cart item
            for (const item of cart.items) {
                const originalPrice = item.product.variants[item.variant].price;
                const itemSubtotal = originalPrice * item.quantity;
                subtotal += itemSubtotal;
                
                // Calculate offer discount for this item
                let discountPercentage = 0;
                let itemOfferDiscount = 0;
                
                // Get the best offer (product or category)
                if (item.product.offer && item.product.offer.discountPercentage) {
                    discountPercentage = Math.max(discountPercentage, item.product.offer.discountPercentage);
                }
                
                if (item.product.categoryOffer && item.product.categoryOffer.discountPercentage) {
                    discountPercentage = Math.max(discountPercentage, item.product.categoryOffer.discountPercentage);
                }
                
                if (discountPercentage > 0) {
                    itemOfferDiscount = itemSubtotal * (discountPercentage / 100);
                    totalOfferDiscount += itemOfferDiscount;
                }
                
                // Calculate per-unit offer discount
                const perUnitOfferDiscount = item.quantity > 0 ? itemOfferDiscount / item.quantity : 0;
                
                // Calculate final price after offer discount (per unit)
                const finalPriceAfterOffer = originalPrice - perUnitOfferDiscount;
                
                // Store item with discount info (coupon discount will be added later)
                orderItems.push({
                    product: item.product._id,
                    variant: item.variant,
                    quantity: item.quantity,
                    price: originalPrice,
                    originalPrice: originalPrice,
                    offerDiscount: Math.round(itemOfferDiscount),
                    couponDiscount: 0, // Will be calculated after
                    finalPrice: finalPriceAfterOffer // Per unit price after offer discount
                });
            }
            
            // Round the total offer discount
            totalOfferDiscount = Math.round(totalOfferDiscount);
            
            // Calculate shipping fee
            const shippingFee = subtotal >= 1000 ? 0 : 40;
            
            // Calculate GST (18%)
            const gst = Math.round(subtotal * 0.18);
            
            // Get coupon discount from session if exists
            let totalCouponDiscount = 0;
            let couponCode = null;
            let couponId = null;
            
            if (req.session.coupon) {
                totalCouponDiscount = req.session.coupon.discountAmount || 0;
                couponCode = req.session.coupon.code;
                couponId = req.session.coupon.couponId;
                
                // Distribute coupon discount proportionally to each item
                if (totalCouponDiscount > 0) {
                    for (const item of orderItems) {
                        const itemTotal = item.price * item.quantity;
                        const proportion = itemTotal / subtotal;
                        const itemCouponDiscount = Math.round(totalCouponDiscount * proportion);
                        
                        item.couponDiscount = itemCouponDiscount;
                        
                        // Calculate per-unit coupon discount
                        const perUnitCouponDiscount = item.quantity > 0 ? itemCouponDiscount / item.quantity : 0;
                        
                        // Update final price to include coupon discount
                        item.finalPrice = item.finalPrice - perUnitCouponDiscount;
                    }
                }
            }
            
            // Ensure all finalPrice values are valid numbers
            for (const item of orderItems) {
                // Make sure finalPrice is a valid number and not less than 0
                item.finalPrice = Math.max(0, Number(item.finalPrice) || 0);
                
                // Ensure originalPrice is a valid number
                item.originalPrice = Number(item.originalPrice) || 0;
                
                // Round to 2 decimal places
                item.finalPrice = Math.round(item.finalPrice * 100) / 100;
                item.originalPrice = Math.round(item.originalPrice * 100) / 100;
                
                console.log(`Item: ${item.product}, originalPrice: ${item.originalPrice}, finalPrice: ${item.finalPrice}`);
            }
            
            // Calculate total
            const total = subtotal + shippingFee + gst - totalOfferDiscount - totalCouponDiscount;
            const finalTotal = Math.max(0, Math.round(total));
            
            // Prevent COD for orders ₹1000 or above
            if (paymentMethod === 'cod' && finalTotal >= 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Cash on Delivery is not available for orders ₹1000 or above. Please choose another payment method.'
                });
            }
            
            // Calculate expected delivery date
            const expectedDeliveryDate = new Date();
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);
            
            // Create new order
            const orderData = {
                user: userId,
                items: orderItems,
                address: addressId,
                total: finalTotal,
                status: 'Pending',
                paymentMethod: paymentMethod,
                paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Completed',
                expectedDeliveryDate: expectedDeliveryDate,
                subtotal: subtotal,
                shippingFee: shippingFee,
                offerDiscount: totalOfferDiscount,
                couponDiscount: totalCouponDiscount,
                gst: gst
            };
            
            // Add coupon data if exists
            if (couponId) {
                orderData.coupon = {
                    code: couponCode,
                    discount: totalCouponDiscount,
                    couponId: couponId
                };
            }
            
            console.log('Creating order with data:', JSON.stringify(orderData, null, 2));
            const order = await Order.create(orderData);
            
            // Update product stock quantities
            try {
                for (const item of orderItems) {
                    const product = await Product.findById(item.product);
                    if (product && product.variants && product.variants[item.variant]) {
                        // Reduce the stock quantity
                        const currentStock = product.variants[item.variant].stock || 0;
                        const newStock = Math.max(0, currentStock - item.quantity);
                        
                        console.log(`Reducing stock for product ${item.product}, variant ${item.variant}: ${currentStock} -> ${newStock}`);
                        
                        // Update the stock
                        product.variants[item.variant].stock = newStock;
                        
                        // Save the product
                        await product.save();
                    } else {
                        console.warn(`Product or variant not found: Product ID ${item.product}, Variant ${item.variant}`);
                    }
                }
            } catch (stockError) {
                console.error('Error updating product stock:', stockError);
                // Continue with order processing even if stock update fails
                // We may want to add this to a queue for retry or manual intervention
            }
            
            // Process wallet payment if selected
            if (paymentMethod === 'wallet') {
                // Find user's wallet
                let wallet = await Wallet.findOne({ userId });
                
                if (!wallet) {
                    return res.status(400).json({
                        success: false,
                        message: 'Wallet not found'
                    });
                }
                
                // Check if wallet has sufficient balance
                if (wallet.balance < finalTotal) {
                    return res.status(400).json({
                        success: false,
                        message: 'Insufficient wallet balance'
                    });
                }
                
                // Calculate new balance
                const newBalance = wallet.balance - finalTotal;
                
                // Add transaction
                wallet.transactions.push({
                    userId,
                    amount: finalTotal,
                    type: 'debit',
                    description: `Payment for order #${order._id.toString().slice(-6).toUpperCase()}`,
                    orderId: order._id,
                    date: new Date(),
                    balance: newBalance
                });
                
                // Update wallet balance
                wallet.balance = newBalance;
                
                // Save wallet changes
                await wallet.save();
                
                // Update order payment status
                order.paymentStatus = 'Completed';
                await order.save();
                
                console.log(`Wallet payment processed: ${finalTotal} deducted from wallet for user ${userId}`);
            }
            
            // Clear cart after successful order
            await Cart.findOneAndDelete({ user: userId });
            
            // Update coupon usage if a coupon was used
            if (req.session.coupon) {
                await updateCouponUsage(userId, req.session.coupon);
                // Clear coupon from session after successful usage
                delete req.session.coupon;
            }
            
            return res.status(200).json({
                success: true,
                message: 'Order placed successfully',
                orderId: order._id
            });
            
        } catch (error) {
            console.error('Error placing order:', error);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while placing your order: ' + error.message
            });
        }
    },
    getOrder: async (req, res) => {
        try {
            const orderId = req.params.id;
            // Get user ID - handle both normal and Google auth users
            const userId = req.session.user?._id || req.session.user?.id;
            
            console.log('Getting order details for:', orderId, 'User ID:', userId);

            if (!userId) {
                console.error('User ID not found in session:', req.session.user);
                req.flash('error', 'Authentication error. Please log in again.');
                return res.redirect('/users/login');
            }

            const order = await Order.findOne({ _id: orderId, user: userId })
                .populate({
                    path: 'items.product',
                    select: 'name images brand variants'
                })
                .populate('address');

            if (!order) {
                req.flash('error', 'Order not found');
                return res.redirect('/orders');
            }

            // Calculate order progress percentage based on status
            const statusStages = ['Pending', 'Processing', 'Shipped', 'Delivered'];
            const currentStageIndex = statusStages.indexOf(order.status);
            const progressPercentage = ((currentStageIndex + 1) / statusStages.length) * 100;

            // Format dates
            const orderDate = order.createdAt.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            const expectedDate = order.expectedDeliveryDate ? 
                order.expectedDeliveryDate.toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }) : 'Calculating...';

            res.render('orders/order-details', {
                title: `Order #${order._id.toString().slice(-8).toUpperCase()}`,
                order,
                orderDate,
                expectedDate,
                progressPercentage,
                statusStages
            });

        } catch (error) {
            console.error('Error fetching order details:', error);
            req.flash('error', 'Error fetching order details');
            res.redirect('/orders');
        }
    },
    getOrders: async (req, res) => {
        try {
            // Get user ID - handle both normal and Google auth users
            const userId = req.session.user?._id || req.session.user?.id;
            
            console.log('Getting orders for user ID:', userId);
            
            if (!userId) {
                console.error('User ID not found in session:', req.session.user);
                req.flash('error', 'Authentication error. Please log in again.');
                return res.redirect('/users/login');
            }

            const page = parseInt(req.query.page) || 1;
            const limit = 4; // Orders per page

            // Build search query
            let searchQuery = { user: userId };

            // Search by product name
            if (req.query.productName) {
                console.log('Searching for product name:', req.query.productName);
                
                try {
                    // Approach 1: First get all product IDs matching the name
                    const matchingProducts = await Product.find(
                        { name: new RegExp(req.query.productName, 'i') },
                        { _id: 1 }
                    );
                    
                    const productIds = matchingProducts.map(p => p._id);
                    console.log(`Found ${productIds.length} matching products`);
                    
                    if (productIds.length > 0) {
                        // Find orders that contain any of these products
                        const ordersWithMatchingProducts = await Order.find({
                            user: userId,
                            'items.product': { $in: productIds }
                        }).select('_id');
                        
                        const orderIds = ordersWithMatchingProducts.map(o => o._id);
                        console.log(`Found ${orderIds.length} orders with matching products`);
                        
                        if (orderIds.length > 0) {
                            searchQuery._id = { $in: orderIds };
                        } else {
                            // No matching orders, return empty result
                            searchQuery._id = null;
                        }
                    } else {
                        // No matching products, return empty result
                        searchQuery._id = null;
                    }
                } catch (searchError) {
                    console.error('Error searching for products:', searchError);
                    // Continue with normal search if this approach fails
                }
            }

            // Search by status
            if (req.query.status && req.query.status !== 'all') {
                searchQuery.status = req.query.status;
            }

            // Search by date range with robust validation
            if (req.query.startDate || req.query.endDate) {
                try {
                    // Initialize createdAt filter object
                    searchQuery.createdAt = {};
                    
                    // Get current date for validation
                    const currentDate = new Date();
                    currentDate.setHours(23, 59, 59, 999); // End of today
                    
                    // Array to collect validation errors
                    const validationErrors = [];
                    
                    // Validate start date
                    if (req.query.startDate) {
                        const startDate = new Date(req.query.startDate);
                        
                        // Check if date is valid
                        if (isNaN(startDate.getTime())) {
                            validationErrors.push("Start date is invalid");
                            console.warn(`Invalid start date format: "${req.query.startDate}"`);
                            // Use a default early date instead of invalid input
                            searchQuery.createdAt.$gte = new Date(0); // January 1, 1970
                        } 
                        // Check if date is in the future
                        else if (startDate > currentDate) {
                            validationErrors.push("Start date cannot be in the future");
                            console.warn(`Start date is in the future: "${req.query.startDate}"`);
                            // Use current date instead of future date
                            searchQuery.createdAt.$gte = new Date(0);
                        }
                        else {
                            // Valid date - use it
                            searchQuery.createdAt.$gte = startDate;
                        }
                    } else {
                        // No start date provided, use very early date
                        searchQuery.createdAt.$gte = new Date(0);
                    }
                    
                    // Validate end date
                    if (req.query.endDate) {
                        let endDate = new Date(req.query.endDate);
                        
                        // Set to end of day for inclusive results
                        if (!isNaN(endDate.getTime())) {
                            endDate.setHours(23, 59, 59, 999);
                        }
                        
                        // Check if date is valid
                        if (isNaN(endDate.getTime())) {
                            validationErrors.push("End date is invalid");
                            console.warn(`Invalid end date format: "${req.query.endDate}"`);
                            // Use current date instead of invalid input
                            searchQuery.createdAt.$lte = currentDate;
                        }
                        // Check if date is in the future 
                        else if (endDate > currentDate) {
                            validationErrors.push("End date cannot be in the future");
                            console.warn(`End date is in the future: "${req.query.endDate}"`);
                            // Set to current date if future date provided
                            searchQuery.createdAt.$lte = currentDate;
                        }
                        // Check if end date is before start date
                        else if (searchQuery.createdAt.$gte && endDate < searchQuery.createdAt.$gte) {
                            validationErrors.push("End date cannot be before start date");
                            console.warn(`End date is before start date: "${req.query.endDate}" < "${req.query.startDate}"`);
                            // Set end date same as start date
                            searchQuery.createdAt.$lte = new Date(searchQuery.createdAt.$gte);
                            searchQuery.createdAt.$lte.setHours(23, 59, 59, 999);
                        }
                        else {
                            // Valid date - use it
                            searchQuery.createdAt.$lte = endDate;
                        }
                    } else {
                        // No end date provided, use current date
                        searchQuery.createdAt.$lte = currentDate;
                    }
                    
                    console.log('Date range filter applied:', {
                        from: searchQuery.createdAt.$gte.toISOString().split('T')[0],
                        to: searchQuery.createdAt.$lte.toISOString().split('T')[0]
                    });
                    
                    // If there are validation errors, add them to local variables for the view
                    if (validationErrors.length > 0) {
                        res.locals.dateErrors = validationErrors;
                    }
                } catch (dateError) {
                    console.error('Error processing date filters:', dateError);
                    // Fallback to a safe default if any error occurs
                    searchQuery.createdAt = {
                        $gte: new Date(0),
                        $lte: new Date()
                    };
                    // Add error to local variables for the view
                    res.locals.dateErrors = ['Invalid date format. Using default date range.'];
                }
            }

            // Get total counts (independent of pagination)
            const totalOrders = await Order.countDocuments({ user: userId });
            const activeOrders = await Order.countDocuments({ 
                user: userId,
                status: { $in: ['Pending', 'Processing'] }
            });

            // Get filtered orders count
            const filteredCount = await Order.countDocuments(searchQuery);

            console.log('Total orders found:', totalOrders);
            console.log('Filtered orders:', filteredCount);

            // Calculate pagination
            const totalPages = Math.ceil(filteredCount / limit);

            // Fetch paginated and filtered orders
            const orders = await Order.find(searchQuery)
                .populate({
                    path: 'items.product',
                    select: 'name images brand variants'
                })
                .populate('address')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(); 

            console.log('Orders fetched:', orders.length);

            // Ensure total exists for each order
            orders.forEach(order => {
                if (typeof order.total !== 'number') {
                    order.total = 0;
                }
            });

            res.render('orders/orders', {
                title: 'My Orders',
                orders: orders,
                totalOrders: totalOrders,
                activeOrders: activeOrders,
                currentPage: page,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1,
                query: req.query,
                filteredCount: filteredCount,
                dateErrors: res.locals.dateErrors || []
            });

        } catch (error) {
            console.error('Error fetching orders:', error);
            req.flash('error', 'Error fetching orders');
            res.redirect('/users/home');
        }
    },
    cancelOrder: async (req, res) => {
        try {
            const orderId = req.params.id;
            const { cancelReason } = req.body;
            // Get user ID - handle both normal and Google auth users
            const userId = req.session.user?._id || req.session.user?.id;
            
            console.log('Cancelling order:', orderId, 'for user:', userId, 'reason:', cancelReason);

            if (!userId) {
                console.error('User ID not found in session:', req.session.user);
                return res.status(401).json({
                    success: false,
                    message: 'Authentication error. Please log in again.'
                });
            }

            if (!cancelReason) {
                return res.status(400).json({
                    success: false,
                    message: 'Cancellation reason is required'
                });
            }

            // Find the order first to make sure it exists
            const order = await Order.findOne({ 
                _id: orderId, 
                user: userId 
            }).populate('items.product');

            if (!order) {
                console.log('Order not found:', orderId);
                return res.status(404).json({
                    success: false,
                    message: 'Order not found or already cancelled'
                });
            }

            // Check if order can be cancelled (only Pending or Processing orders)
            if (order.status !== 'Pending' && order.status !== 'Processing') {
                return res.status(400).json({
                    success: false,
                    message: 'Only pending or processing orders can be cancelled'
                });
            }

            // Restore stock for each product in the order
            for (const item of order.items) {
                try {
                    // Find the product and update its stock
                    const product = await Product.findById(item.product._id);
                    if (product && product.variants[item.variant]) {
                        console.log(`Restoring stock for product ${item.product._id}, variant ${item.variant}, quantity ${item.quantity}`);
                        product.variants[item.variant].stock += item.quantity;
                        await product.save();
                        console.log(`Stock restored. New stock: ${product.variants[item.variant].stock}`);
                    }
                } catch (error) {
                    console.error(`Error restoring stock for product ${item.product._id}:`, error);
                    // Continue with other products even if one fails
                }
            }

            // Process refund if payment was already made
            if (order.paymentStatus === 'Completed') {
                // Find user's wallet
                let wallet = await Wallet.findOne({ userId });
                
                if (!wallet) {
                    console.log('Creating new wallet for user:', userId);
                    wallet = await Wallet.create({
                        userId,
                        balance: 0,
                        transactions: []
                    });
                    
                    // Update user with wallet reference
                    await User.findByIdAndUpdate(userId, { wallet: wallet._id });
                }
                
                // Calculate refund amount (total excluding coupon discount)
                let refundAmount = order.total;
                
                // If payment method was razorpay or wallet, add back the coupon discount to the refund amount
                if (order.paymentMethod === 'razorpay' || order.paymentMethod === 'wallet') {
                    refundAmount = order.subtotal + order.shippingFee + order.gst - order.offerDiscount-order.couponDiscount;
                    console.log(`${order.paymentMethod} payment refund: ${refundAmount} (excluding coupon discount of ${order.couponDiscount})`);
                }
                
                // Calculate new balance
                const newBalance = wallet.balance + refundAmount;
                
                // Add refund transaction to wallet
                wallet.transactions.push({
                    type: 'credit',
                    amount: refundAmount,
                    description: `Refund for cancelled order #${order._id.toString().slice(-6).toUpperCase()}`,
                    orderId: order._id,
                    date: new Date(),
                    balance: newBalance,
                    userId
                });
                
                // Update wallet balance
                wallet.balance = newBalance;
                
                // Save wallet changes
                await wallet.save();
                console.log(`Refund processed: ${refundAmount} added to wallet for user ${userId}`);
                
                // Mark the order as having a refund processed for admin tracking
                order.refundProcessed = true;
                order.refundAmount = refundAmount;
                order.refundDate = new Date();
            }

            // Update the order status instead of deleting it
            order.status = 'Cancelled';
            order.cancelReason = cancelReason;
            order.paymentStatus = order.paymentStatus === 'Completed' ? 'Refunded' : order.paymentStatus;
            await order.save();
            
            console.log('Order cancelled successfully:', orderId);

            res.json({
                success: true,
                message: 'Order cancelled successfully'
            });

        } catch (error) {
            console.error('Error cancelling order:', error);
            res.status(500).json({
                success: false,
                message: 'Error cancelling order: ' + error.message
            });
        }
    },
    markAsDelivered: async (req, res) => {
        try {
            const orderId = req.params.id;

            // Find the order and update its status
            const order = await Order.findById(orderId);
            if (!order) {
                req.flash('error', 'Order not found');
                return res.redirect('/admin/orders');
            }

            // Update order status and delivered date
            order.status = 'Delivered';
            order.deliveredAt = new Date();
            order.paymentStatus = 'Completed';
            await order.save();

            req.flash('success', 'Order marked as delivered');
            res.redirect(`/admin/orders/${orderId}`);
        } catch (error) {
            console.error('Error marking order as delivered:', error);
            req.flash('error', 'Error marking order as delivered');
            res.redirect('/admin/orders');
        }
    },
    returnOrder: async (req, res) => {
        try {
            const { id: orderId, productId } = req.params;
            const { returnReason } = req.body;
            
            console.log(`Processing return request - Order ID: ${orderId}, Product ID: ${productId}`);
            
            // Get user ID from session
            const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
            
            if (!returnReason) {
                return res.status(400).json({
                    success: false,
                    message: 'Return reason is required'
                });
            }
            
            // Find the order
            const order = await Order.findOne({ 
                _id: orderId, 
                user: userId 
            });
            
            if (!order) {
                console.error(`Order not found or doesn't belong to user ${userId}`);
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }
            
            console.log(`Order found: ${order._id}, status: ${order.status}`);
            
            if (order.status !== 'Delivered') {
                return res.status(400).json({
                    success: false,
                    message: 'Only delivered orders can be returned'
                });
            }
            
            // Find the specific item in the order
            const itemIndex = order.items.findIndex(item => 
                item.product.toString() === productId
            );
            
            console.log(`Item index: ${itemIndex}, Items count: ${order.items.length}`);
            
            if (itemIndex === -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found in this order'
                });
            }
            
            // Check if return is already requested for this item
            if (order.items[itemIndex].returnStatus) {
                return res.status(400).json({
                    success: false,
                    message: 'Return already requested for this product'
                });
            }
            
            // Update the item with return information
            order.items[itemIndex].returnStatus = 'pending';
            order.items[itemIndex].returnReason = returnReason;
            order.items[itemIndex].returnRequestDate = new Date();
            
            console.log(`Updating item at index ${itemIndex} with return status 'pending'`);
            
            // Save the updated order
            await order.save();
            
            return res.json({
                success: true,
                message: 'Return request submitted successfully'
            });
            
        } catch (error) {
            console.error('Error processing return request:', error);
            return res.status(500).json({
                success: false,
                message: 'Error processing return request: ' + error.message
            });
        }
    },
    getOrderDetails: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            // Get user ID - handle both normal and Google auth users
            const userId = req.session.user?._id || req.session.user?.id;
            
            if (!userId) {
                req.flash('error', 'Authentication error. Please log in again.');
                return res.redirect('/users/login');
            }
            
            // Find the order and make sure it belongs to the current user
            const order = await Order.findOne({ 
                _id: orderId, 
                user: userId 
            }).populate({
                path: 'items.product',
                select: 'name images brand variants'
            }).populate('address');
            
            if (!order) {
                req.flash('error', 'Order not found');
                return res.redirect('/orders');
            }
            
            // Define the status stages for the progress tracker
            const statusStages = ['Pending', 'Processing', 'Shipped', 'Delivered'];
            
            // Format order date
            const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Calculate expected delivery date
            const expectedDate = new Date(order.expectedDeliveryDate || order.createdAt);
            if (!order.expectedDeliveryDate) {
                expectedDate.setDate(expectedDate.getDate() + 5);
            }
            const formattedExpectedDate = expectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Ensure all monetary values are numbers
            const orderData = {
                ...order.toObject(),
                subtotal: parseFloat(order.subtotal) || 0,
                shippingFee: parseFloat(order.shippingFee) || 0,
                offerDiscount: parseFloat(order.offerDiscount) || 0,
                couponDiscount: parseFloat(order.couponDiscount) || 0,
                gst: parseFloat(order.gst) || 0,
                total: parseFloat(order.total) || 0
            };

            res.render('orders/order-details', {
                title: 'Order Details',
                order: orderData,
                statusStages: statusStages,
                expectedDate: formattedExpectedDate,
                orderDate: orderDate
            });

        } catch (error) {
            console.error('Error fetching order details:', error);
            req.flash('error', 'Error fetching order details');
            res.redirect('/orders');
        }
    },
    generateInvoice: async (req, res) => {
        try {
            const orderId = req.params.orderId;
            const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
            
            console.log('Generating invoice for order:', orderId);
            
            // Find the order and make sure it belongs to the current user
            const order = await Order.findOne({ 
                _id: orderId, 
                user: userId 
            }).populate({
                path: 'items.product',
                select: 'name brand'
            }).populate('address').populate('user');
            
            if (!order) {
                console.error('Order not found:', orderId);
                req.flash('error', 'Order not found');
                return res.redirect('/orders');
            }
            
            // Create a new PDF document
            const doc = new PDFDocument({ margin: 50 });
            
            // Set response headers for file download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);
            
            // Pipe the PDF to the response
            doc.pipe(res);
            
            // Add company logo and header
            doc.fontSize(20).text('Brewtopia', { align: 'center' });
            doc.fontSize(10).text('Premium Coffee & Accessories', { align: 'center' });
            doc.moveDown();
            
            // Add invoice title and order number
            doc.fontSize(16).text('INVOICE', 50, 120);
            doc.fontSize(10).text(`Order #${order._id.toString().slice(-8).toUpperCase()}`, 50, 140);
            
            // Add order date
            const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            doc.text(`Date: ${orderDate}`, 50, 160);
            
            // Add customer information
            doc.fontSize(12).text('Bill To:', 50, 200);
            doc.fontSize(10).text(`${order.address.name}`, 50, 220);
            doc.text(`${order.address.street}`, 50, 235);
            doc.text(`${order.address.city}, ${order.address.state} ${order.address.pinCode}`, 50, 250);
            doc.text(`Phone: ${order.address.phone}`, 50, 265);
            
            // Add table headers
            let y = 320;
            doc.fontSize(10).text('Product', 50, y);
            doc.text('Variant', 200, y);
            doc.text('Qty', 280, y);
            doc.text('Price', 350, y);
            doc.text('Total', 450, y);
            
            y += 15;
            doc.moveTo(50, y).lineTo(550, y).stroke();
            y += 15;
            
            // Add order items
            order.items.forEach(item => {
                const productName = item.product.name;
                const variant = item.variant;
                const quantity = item.quantity;
                const price = item.price;
                const total = price * quantity;
                
                doc.text(productName, 50, y, {width: 140});
                doc.text(variant, 200, y);
                doc.text(quantity.toString(), 280, y);
                doc.text(`₹${price}`, 350, y);
                doc.text(`₹${total}`, 450, y);
                
                y += 20;
            });
            
            // Draw a line
            doc.moveTo(50, y).lineTo(550, y).stroke();
            y += 20;
            
            // Order summary with fixed values
            doc.fontSize(10).text('Subtotal:', 350, y);
            doc.text(`₹${order.subtotal}`, 450, y);
            y += 15;
            
            doc.fontSize(10).text('Discount:', 350, y);
            doc.text(`-₹${order.offerDiscount}`, 450, y);
            y += 15;
            
            doc.fontSize(10).text('Shipping:', 350, y);
            doc.text(`₹${order.shippingFee}`, 450, y);
            y += 15;
            
            doc.fontSize(10).text('GST (18%):', 350, y);
            doc.text(`₹${order.gst}`, 450, y);
            y += 15;
            
            // Draw a line
            doc.moveTo(350, y).lineTo(550, y).stroke();
            y += 15;
            
            // Total
            doc.fontSize(12).text('Total:', 350, y, {font: 'Helvetica-Bold'});
            doc.fontSize(12).text(`₹${order.total}`, 450, y, {font: 'Helvetica-Bold'});
            
            // Add footer
            doc.fontSize(10).text('Thank you for shopping with Brewtopia!', 50, 700, {align: 'center'});
            doc.fontSize(8).text('This is a computer-generated invoice and does not require a signature.', 50, 720, {align: 'center'});
            
            // Finalize the PDF and send it
            doc.end();
            
        } catch (error) {
            console.error('Error generating invoice:', error);
            req.flash('error', 'Error generating invoice: ' + error.message);
            return res.redirect('/orders');
        }
    },
    deleteProductFromOrder: async (req, res) => {
        try {
            console.log('Request parameters:', req.params);
            console.log('Request body:', req.body);
            
            const orderId = req.params.orderId || req.params.id;
            const itemId = req.params.itemId || req.params.productId || req.body.itemId;
            
            console.log(`Attempting to delete item ${itemId} from order ${orderId}`);
            
            const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
            
            // Find the order and ensure it belongs to the user
            const order = await Order.findOne({ _id: orderId, user: userId })
                .populate('items.product');
            
            if (!order) {
                console.log('Order not found');
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            
            console.log('Order items:', order.items.map(item => ({
                id: item._id ? item._id.toString() : 'no-id',
                productId: item.product && item.product._id ? item.product._id.toString() : 'no-product-id',
                variant: item.variant
            })));
            
            if (order.status !== 'Pending' && order.status !== 'Processing') {
                console.log(`Cannot modify order with status: ${order.status}`);
                return res.status(400).json({ 
                    success: false, 
                    message: `Cannot modify order that is in ${order.status} status` 
                });
            }
            
            if (order.items.length <= 1) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Cannot remove the last product from an order. Please cancel the entire order instead.' 
                });
            }
            
            // Find the product in the order - try multiple ways to match
            let itemIndex = -1;
            
            // Try to find by item._id
            itemIndex = order.items.findIndex(item => 
                item._id && item._id.toString() === itemId
            );
            
            // If not found, try to find by product._id
            if (itemIndex === -1) {
                itemIndex = order.items.findIndex(item => 
                    item.product && item.product._id && item.product._id.toString() === itemId
                );
            }
            
            if (itemIndex === -1) {
                console.error(`Item not found in order. ItemId: ${itemId}, OrderId: ${orderId}`);
                return res.status(404).json({ success: false, message: 'Product not found in this order' });
            }
            
            console.log(`Found item at index ${itemIndex}`);
            
            // Get the item before removing it
            const removedItem = order.items[itemIndex];
            
            // Calculate the actual amount to refund
            const itemFinalPrice = removedItem.finalPrice * removedItem.quantity;
            
            // Update inventory - add the quantity back to stock
            try {
                const product = await Product.findById(removedItem.product._id);
                if (product && product.variants[removedItem.variant]) {
                    console.log(`Restoring stock for product ${removedItem.product._id}, variant ${removedItem.variant}, quantity ${removedItem.quantity}`);
                    product.variants[removedItem.variant].stock += removedItem.quantity;
                    await product.save();
                }
            } catch (error) {
                console.error(`Error restoring stock:`, error);
                // Continue with order update even if stock update fails
            }
            
            // Process refund if payment was already made
            if (order.paymentStatus === 'Completed') {
                try {
                    // Find user's wallet
                    let wallet = await Wallet.findOne({ userId });
                    
                    if (!wallet) {
                        wallet = await Wallet.create({
                            userId,
                            balance: 0,
                            transactions: []
                        });
                        await User.findByIdAndUpdate(userId, { wallet: wallet._id });
                    }
                    
                    // Add refund transaction to wallet
                    const newBalance = wallet.balance + itemFinalPrice;
                    wallet.transactions.push({
                        type: 'credit',
                        amount: itemFinalPrice,
                        description: `Refund for removed item from order #${order._id.toString().slice(-6).toUpperCase()}`,
                        orderId: order._id,
                        date: new Date(),
                        balance: newBalance,
                        userId
                    });
                    
                    wallet.balance = newBalance;
                    await wallet.save();
                    
                    // Mark the order as having a partial refund processed for admin tracking
                    order.partialRefundProcessed = true;
                    order.partialRefundAmount = (order.partialRefundAmount || 0) + itemFinalPrice;
                    order.partialRefundDate = new Date();
                } catch (refundError) {
                    console.error('Error processing refund:', refundError);
                }
            }
            
            // Remove the product from the order
            order.items.splice(itemIndex, 1);
            
            // Recalculate order totals
            let subtotal = 0;
            let offerDiscount = 0;
            
            order.items.forEach(item => {
                if (item && item.price && item.quantity) {
                    subtotal += (item.price * item.quantity);
                    offerDiscount += (item.offerDiscount || 0);
                }
            });
            
            // Recalculate coupon discount
            let couponDiscount = 0;
            if (order.couponDiscount > 0) {
                // If only one item remains, apply full coupon discount
                if (order.items.length === 1) {
                    couponDiscount = order.couponDiscount;
                } else {
                    // Proportional distribution for multiple items
                    const proportion = subtotal / order.subtotal;
                    couponDiscount = Math.round(order.couponDiscount * proportion);
                }
            }
            
            // Calculate shipping fee
            const shippingFee = subtotal >= 1000 ? 0 : 40;
            
            // Calculate GST (18% of subtotal)
            const gst = Math.round(subtotal * 0.18);
            
            // Calculate total
            const total = subtotal + shippingFee + gst - offerDiscount - couponDiscount;
            
            // Update order with new values
            order.subtotal = subtotal;
            order.offerDiscount = offerDiscount;
            order.couponDiscount = couponDiscount;
            order.shippingFee = shippingFee;
            order.gst = gst;
            order.total = total;
            
            console.log('Updated order totals:', {
                subtotal,
                offerDiscount,
                couponDiscount,
                shippingFee,
                gst,
                total
            });
            
            // Save the updated order
            await order.save();
            
            return res.json({ 
                success: true, 
                message: 'Product removed successfully and refund processed',
                newTotal: total
            });
            
        } catch (error) {
            console.error('Error removing product from order:', error);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    },
    processReturnRefund: async (orderId, userId, itemId) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                console.error('Order not found for refund processing');
                return false;
            }

            // Find the specific item in the order
            const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
            if (itemIndex === -1) {
                console.error('Item not found in order');
                return false;
            }

            // Get the item before processing
            const returnedItem = order.items[itemIndex];

            // Find or create wallet
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = await Wallet.create({
                    userId,
                    balance: 0,
                    transactions: []
                });
                await User.findByIdAndUpdate(userId, { wallet: wallet._id });
            }

            // Calculate refund amount using the same logic as cancelOrder
            const itemTotal = returnedItem.finalprice * returnedItem.quantity;
            console.log(itemTotal)
            const itemProportion = itemTotal / order.subtotal;
            
            // Calculate refund amount including proportional GST and shipping
            const refundAmount = Math.round(
                itemTotal + 
                (order.gst * itemProportion) + 
                (order.shippingFee * itemProportion)
            );

            // Add refund transaction to wallet
            const newBalance = wallet.balance + refundAmount;
            wallet.transactions.push({
                userId,
                amount: refundAmount,
                type: 'credit',
                description: `Refund for returned item from order #${order._id.toString().slice(-6).toUpperCase()}`,
                orderId: order._id,
                date: new Date(),
                balance: newBalance
            });

            wallet.balance = newBalance;
            await wallet.save();

            // Mark item as returned
            order.items[itemIndex].status = 'Returned';
            
            // Mark the order as having a return refund processed for admin tracking
            order.returnRefundProcessed = true;
            order.returnRefundAmount = (order.returnRefundAmount || 0) + refundAmount;
            order.returnRefundDate = new Date();

            // Recalculate order totals
            let subtotal = 0;
            let offerDiscount = 0;

            order.items.forEach(item => {
                if (item && item.price && item.quantity && item.status !== 'Returned') {
                    subtotal += (item.price * item.quantity);
                    offerDiscount += (item.offerDiscount || 0);
                }
            });

            // Recalculate coupon discount
            let couponDiscount = 0;
            if (order.couponDiscount > 0) {
                const activeItems = order.items.filter(item => item.status !== 'Returned');
                if (activeItems.length === 1) {
                    couponDiscount = order.couponDiscount;
                } else {
                    const proportion = subtotal / order.subtotal;
                    couponDiscount = Math.round(order.couponDiscount * proportion);
                }
            }

            // Calculate shipping fee
            const shippingFee = subtotal >= 1000 ? 0 : 40;

            // Calculate GST (18% of subtotal)
            const gst = Math.round(subtotal * 0.18);

            // Calculate total
            const total = subtotal + shippingFee + gst - offerDiscount - couponDiscount;

            // Update order with new values
            order.subtotal = subtotal;
            order.offerDiscount = offerDiscount;
            order.couponDiscount = couponDiscount;
            order.shippingFee = shippingFee;
            order.gst = gst;
            order.total = total;

            await order.save();

            console.log(`Return refund processed: Amount ${refundAmount} added to wallet for user ${userId}`);
            return true;
        } catch (error) {
            console.error('Error processing return refund:', error);
            return false;
        }
    },
    // Helper function to create a failed order
    async createFailedOrder(userId, addressId, failureReason, errorDetails = {}) {
        try {
            // Get cart details
            const cart = await Cart.findOne({ user: userId })
                .populate({
                    path: 'items.product',
                    model: 'Product'
                });
            
            if (!cart) {
                throw new Error('Cart not found');
            }

            // Get address details
            const address = await Address.findById(addressId);
            if (!address) {
                throw new Error('Delivery address not found');
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
                    quantity: item.quantity,
                    originalPrice: price,
                    finalPrice: price
                };
            });
            
            // Calculate shipping fee
            const shippingFee = subtotal >= 1000 ? 0 : 40;
            
            // Calculate GST (18%)
            const gst = Math.round(subtotal * 0.18);
            
            // Calculate total
            const total = subtotal + shippingFee + gst;
            
            // Create the failed order with payment failure details
            const order = new Order({
                user: userId,
                items: orderItems,
                address: addressId,
                paymentMethod: 'razorpay',
                status: 'Cancelled',
                paymentStatus: 'Failed',
                cancelReason: failureReason,
                subtotal: subtotal,
                shippingFee: shippingFee,
                gst: gst,
                total: Math.round(total),
                paymentFailure: {
                    reason: failureReason,
                    errorCode: errorDetails.errorCode || 'PAYMENT_FAILED',
                    errorMessage: errorDetails.errorMessage || 'Payment verification failed',
                    failureDate: new Date(),
                    razorpayError: errorDetails.razorpayError || {}
                }
            });
            
            await order.save();
            
            return order;
        } catch (error) {
            console.error('Error creating failed order:', error);
            throw error;
        }
    },
    // Verify Razorpay payment
    verifyPayment: async (req, res) => {
        try {
            const { razorpay_payment_id, razorpay_order_id, razorpay_signature, addressId } = req.body;
            
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
                // Create a failed order with signature verification failure
                const failedOrder = await this.createFailedOrder(userId, addressId, 'Payment signature verification failed', {
                    errorCode: 'SIGNATURE_VERIFICATION_FAILED',
                    errorMessage: 'The payment signature verification failed',
                    razorpayError: {
                        orderId: razorpay_order_id,
                        paymentId: razorpay_payment_id,
                        signature: razorpay_signature
                    }
                });
                
                return res.status(400).json({
                    success: false,
                    message: 'Payment verification failed',
                    orderId: failedOrder._id
                });
            }
            
            // ... rest of the existing verifyPayment code ...
            
        } catch (error) {
            console.error('Payment verification error:', error);
            
            // Try to create a failed order if we have the user ID and address ID
            try {
                if (req.body.addressId) {
                    const failedOrder = await this.createFailedOrder(
                        req.session.user?._id || req.session.user?.id, 
                        req.body.addressId, 
                        'Payment verification failed',
                        {
                            errorCode: 'VERIFICATION_ERROR',
                            errorMessage: error.message || 'An error occurred during payment verification',
                            razorpayError: error
                        }
                    );
                    
                    return res.status(500).json({
                        success: false,
                        message: 'Payment verification failed',
                        orderId: failedOrder._id
                    });
                }
            } catch (orderError) {
                console.error('Error creating failed order:', orderError);
            }
            
            res.status(500).json({
                success: false,
                message: 'Payment verification failed',
                error: error.message
            });
        }
    },
    // Update the payment status for a previously failed order when payment is successfull
    updatePaymentStatus: async (req, res) => {
        try {
            const orderId = req.params.id;
            const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

            // Find the order
            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Verify that the order belongs to the logged-in user
            const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
            if (order.user.toString() !== userId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not authorized to update this order'
                });
            }

            // Calculate expected delivery date (7 days from now)
            const expectedDeliveryDate = new Date();
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);

            // Update the order status
            order.status = 'Processing';
            order.paymentStatus = 'Completed';
            order.paymentId = razorpay_payment_id;
            order.razorpayOrderId = razorpay_order_id;
            order.razorpayPaymentId = razorpay_payment_id;
            order.razorpaySignature = razorpay_signature;
            order.cancelReason = null;
            order.paymentFailure = null;
            order.expectedDeliveryDate = expectedDeliveryDate;
            
            // Save the updated order
            await order.save();

            return res.status(200).json({
                success: true,
                message: 'Order payment status updated successfully',
                orderId: order._id
            });
        } catch (error) {
            console.error('Error updating payment status:', error);
            return res.status(500).json({
                success: false,
                message: 'Error updating payment status',
                error: error.message
            });
        }
    },
}

module.exports = orderController;
