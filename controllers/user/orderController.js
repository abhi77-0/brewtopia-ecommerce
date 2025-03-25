const Order = require('../../models/Order');
const Cart = require('../../models/shopingCart');
const User = require('../../models/userModel');
const Product = require('../../models/Product');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Address = require('../../models/Address');
const Wallet = require('../../models/walletModel');

const orderController = {
    placeOrder: async (req, res) => {
        try {
            console.log('Starting place order process...');
            
            const { addressId, paymentMethod } = req.body;
            
            // Find the cart for the user with populated product details
            const cart = await Cart.findOne({ user: req.user._id })
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
            
            // Calculate expected delivery date (e.g., 7 days from now)
            const expectedDeliveryDate = new Date();
            expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + 7);
            
            // Create new order
            const orderData = {
                user: req.user._id,
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
            
            // Process wallet payment if selected
            if (paymentMethod === 'wallet') {
                // Find user's wallet
                let wallet = await Wallet.findOne({ userId: req.user._id });
                
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
                    userId: req.user._id,
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
                
                console.log(`Wallet payment processed: ${finalTotal} deducted from wallet for user ${req.user._id}`);
            }
            
            // Clear cart after successful order
            await Cart.findOneAndUpdate(
                { user: req.user._id },
                { $set: { items: [] } }
            );
            
            // Clear coupon from session
            if (req.session.coupon) {
                delete req.session.coupon;
            }
            
            return res.status(200).json({
                success: true,
                message: 'Order placed successfully',
                orderId: order._id
            });
            
        } catch (error) {
            console.error('Error in placeOrder:', error);
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

            // Get total counts (independent of pagination)
            const totalOrders = await Order.countDocuments({ user: userId });
            const activeOrders = await Order.countDocuments({ 
                user: userId,
                status: { $in: ['Pending', 'Processing'] }
            });

            console.log('Total orders found:', totalOrders);

            // Calculate pagination
            const totalPages = Math.ceil(totalOrders / limit);

            // Fetch paginated orders
            const orders = await Order.find({ user: userId })
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
                prevPage: page - 1
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
            // Get user ID - handle both normal and Google auth users
            const userId = req.session.user?._id || req.session.user?.id;
            
            console.log('Cancelling order:', orderId, 'for user:', userId);

            if (!userId) {
                console.error('User ID not found in session:', req.session.user);
                return res.status(401).json({
                    success: false,
                    message: 'Authentication error. Please log in again.'
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
            }

            // Update the order status instead of deleting it
            order.status = 'Cancelled';
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
}

module.exports = orderController;
