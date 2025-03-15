const Order = require('../../models/Order');
const Cart = require('../../models/shopingCart');
const User = require('../../models/userModel');
const Product = require('../../models/product');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const orderController = {
    placeOrder: async (req, res) => {
        try {
            console.log('Starting place order process...');
            const userId = req.session.user.id;
            const { addressId, paymentMethod } = req.body;

            // Get cart with populated product details
            const cart = await Cart.findOne({ user: userId }).populate('items.product');
            
            if (!cart || cart.items.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Cart is empty' 
                });
            }

            console.log('Cart found, creating order...');

            // Create order items and calculate total
            let total = 0;
            const orderItems = cart.items.map(item => {
                const itemTotal = item.product.variants[item.variant].price * item.quantity;
                total += itemTotal;
                return {
                    product: item.product._id,
                    variant: item.variant,
                    quantity: item.quantity,
                    price: item.product.variants[item.variant].price
                };
            });

            // Fetch the selected address
            const user = await User.findById(userId);
            const selectedAddress = user.addresses.find(addr => addr._id.toString() === addressId);

            if (!selectedAddress) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid address selected'
                });
            }

            // Calculate subtotal, discount, shipping, and gst
            const subtotal = total;
            const discount = Math.round(subtotal * 0.1);
            const shipping = 40;
            const gst = Math.round(subtotal * 0.18);
            const calculatedTotal = subtotal - discount + shipping + gst;

            // Create new order
            const order = new Order({
                user: userId,
                items: orderItems,
                total: calculatedTotal,
                address: selectedAddress._id,  // Use the ObjectId of the selected address
                paymentMethod: paymentMethod,
                status: 'Pending',
                subtotal,
                discount,
                shipping,
                gst
            });

            // Save order
            await order.save();
            console.log('Order saved, updating stock...');

            // Update stock for each product
            for (const item of cart.items) {
                console.log(`Updating stock for product ${item.product._id}, variant ${item.variant}`);
                
                // Find the product and update its stock
                const product = await Product.findById(item.product._id);
                if (product && product.variants[item.variant]) {
                    product.variants[item.variant].stock -= item.quantity;
                    await product.save();
                    console.log(`Stock updated. New stock: ${product.variants[item.variant].stock}`);
                }
            }

            // Clear cart
            await Cart.findOneAndUpdate(
                { user: userId },
                { $set: { items: [] } }
            );

            console.log('Order process completed successfully');

            res.status(200).json({
                success: true,
                message: 'Order placed successfully',
                orderId: order._id
            });

        } catch (error) {
            console.error('Error in placeOrder:', error);
            res.status(500).json({
                success: false,
                message: 'Error placing order'
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
            });

            if (!order) {
                console.log('Order not found:', orderId);
                return res.status(404).json({
                    success: false,
                    message: 'Order not found or already cancelled'
                });
            }

            // Update the order status instead of deleting it
            order.status = 'Cancelled';
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
            const orderId = req.params.id;
            const { returnReason } = req.body;

            // Find the order and update its status
            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Check if order is eligible for return (e.g., within 7 days of delivery)
            if (order.status !== 'Delivered') {
                return res.status(400).json({
                    success: false,
                    message: 'Only delivered orders can be returned'
                });
            }

            const deliveryDate = new Date(order.deliveredAt);
            const currentDate = new Date();
            const daysSinceDelivery = Math.floor((currentDate - deliveryDate) / (1000 * 60 * 60 * 24));

            if (daysSinceDelivery > 7) {
                return res.status(400).json({
                    success: false,
                    message: 'Return period has expired (7 days from delivery)'
                });
            }

            // Update order with return request details
            order.returnRequest = true;
            order.returnStatus = 'pending';
            order.returnReason = returnReason;
            order.returnRequestDate = new Date();
            order.status = 'Return Requested';
            
            await order.save();

            res.json({
                success: true,
                message: 'Return request submitted successfully'
            });

        } catch (error) {
            console.error('Error processing return request:', error);
            res.status(500).json({
                success: false,
                message: 'Error processing return request: ' + error.message
            });
        }
    },
    getOrderDetails: async (req, res) => {
        try {
            const orderId = req.params.id;
            
            const order = await Order.findOne({ 
                _id: orderId,
                user: req.user._id
            })
            .populate({
                path: 'items.product',
                select: 'name images brand variants price'
            })
            .populate('address');

            if (!order) {
                req.flash('error', 'Order not found');
                return res.redirect('/orders');
            }

            // Define the status stages
            const statusStages = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

            // Format order date
            const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Calculate expected delivery date
            const expectedDate = new Date(order.createdAt);
            expectedDate.setDate(expectedDate.getDate() + 5);
            const formattedExpectedDate = expectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            res.render('orders/order-details', {
                title: 'Order Details',
                order: order,
                statusStages: statusStages,
                expectedDate: formattedExpectedDate,
                orderDate: orderDate  // Pass the formatted order date
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
            // Get user ID - handle both normal and Google auth users
            const userId = req.session.user?._id || req.session.user?.id;
            
            if (!userId) {
                console.error('User ID not found in session:', req.session.user);
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
            
            // Calculate all values to ensure they're valid
            let subtotal = order.subtotal;
            if (!subtotal || isNaN(subtotal)) {
                subtotal = 0;
                order.items.forEach(item => {
                    subtotal += (item.price * item.quantity);
                });
            }
            
            const discountAmount = Math.round(subtotal * 0.1);
            const shippingAmount = 40;
            const gstAmount = Math.round(subtotal * 0.18);
            const totalAmount = Math.round(subtotal - discountAmount + shippingAmount + gstAmount);
            
            // Create a PDF document
            const doc = new PDFDocument({margin: 50});
            
            // Set response headers for PDF download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=invoice-${order._id.toString().slice(-8).toUpperCase()}.pdf`);
            
            // Pipe the PDF to the response
            doc.pipe(res);
            
            // Add company logo and header
            // doc.image('public/images/logo.png', 50, 45, {width: 100});
            doc.fontSize(20).text('BREWTOPIA', 50, 50);
            doc.fontSize(10).text('Premium Craft Beer', 50, 75);
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
            doc.text(`₹${subtotal}`, 450, y);
            y += 15;
            
            doc.fontSize(10).text('Discount:', 350, y);
            doc.text(`-₹${discountAmount}`, 450, y);
            y += 15;
            
            doc.fontSize(10).text('Shipping:', 350, y);
            doc.text(`₹${shippingAmount}`, 450, y);
            y += 15;
            
            doc.fontSize(10).text('GST (18%):', 350, y);
            doc.text(`₹${gstAmount}`, 450, y);
            y += 15;
            
            // Draw a line
            doc.moveTo(350, y).lineTo(550, y).stroke();
            y += 15;
            
            // Total
            doc.fontSize(12).text('Total:', 350, y, {font: 'Helvetica-Bold'});
            doc.fontSize(12).text(`₹${totalAmount}`, 450, y, {font: 'Helvetica-Bold'});
            
            // Add footer
            doc.fontSize(10).text('Thank you for shopping with Brewtopia!', 50, 700, {align: 'center'});
            doc.fontSize(8).text('This is a computer-generated invoice and does not require a signature.', 50, 720, {align: 'center'});
            
            // Finalize the PDF
            doc.end();
            
        } catch (error) {
            console.error('Error generating invoice:', error);
            req.flash('error', 'Error generating invoice');
            res.redirect('/orders');
        }
    }
};

module.exports = orderController; 