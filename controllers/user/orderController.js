const Order = require('../../models/order');
const Cart = require('../../models/shopingCart');
const User = require('../../models/userModel');
const Product = require('../../models/product');

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

            // Create new order
            const order = new Order({
                user: userId,
                items: orderItems,
                total: total,
                address: selectedAddress._id,  // Use the ObjectId of the selected address
                paymentMethod: paymentMethod,
                status: 'Pending'
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
            const userId = req.session.user.id;

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

            const expectedDate = order.expectedDeliveryDate.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

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
            const userId = req.user?._id || req.session?.user?._id;
            const page = parseInt(req.query.page) || 1;
            const limit = 4; // Orders per page

            // Get total counts (independent of pagination)
            const totalOrders = await Order.countDocuments({ user: userId });
            const activeOrders = await Order.countDocuments({ 
                user: userId,
                status: { $in: ['Pending', 'Processing'] }
            });

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
                .lean(); // Add this to convert to plain JavaScript objects

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
            const userId = req.user?._id || req.session?.user?._id;

            const order = await Order.findOneAndDelete({ _id: orderId, user: userId });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found or already cancelled'
                });
            }

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
    }
};

module.exports = orderController; 