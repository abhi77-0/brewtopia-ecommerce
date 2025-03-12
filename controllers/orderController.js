const Order = require('../models/Order');
const Cart = require('../models/shopingCart');

const orderController = {
    placeOrder: async (req, res) => {
        try {
            const { addressId, paymentMethod } = req.body;
            // Get user ID directly from req.user or req.session.user
            const userId = req.user?._id || req.session?.user?._id;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            console.log('User ID:', userId); // Debug log

            // First check if cart exists, if not create one
            let cart = await Cart.findOne({ user: userId })
                .populate({
                    path: 'items.product',
                    select: 'name images variants brand'
                });

            if (!cart) {
                // Create a new cart if it doesn't exist
                cart = await Cart.create({
                    user: userId,
                    items: []
                });
            }

            console.log('Found cart:', cart); // Debug log

            if (!cart.items || cart.items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Your cart is empty. Please add items before placing an order.'
                });
            }

            // Calculate totals
            let subtotal = 0;
            const orderItems = cart.items.map(item => {
                const itemPrice = item.product.variants[item.variant].price;
                subtotal += itemPrice * item.quantity;
                
                return {
                    product: item.product._id,
                    variant: item.variant,
                    quantity: item.quantity,
                    price: itemPrice
                };
            });

            const shipping = 40; // Fixed shipping cost
            const discount = subtotal * 0.10; // 10% discount
            const total = subtotal + shipping - discount;

            // Create new order
            const order = await Order.create({
                user: userId,
                items: orderItems,
                address: addressId,
                total: Math.round(total),
                status: 'Pending',
                paymentMethod: paymentMethod,
                paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Completed',
                expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
            });

            // Clear the cart
            await Cart.findOneAndUpdate(
                { user: userId },
                { $set: { items: [] } }
            );

            res.json({
                success: true,
                orderId: order._id
            });

        } catch (error) {
            console.error('Error placing order:', error);
            res.status(500).json({
                success: false,
                message: 'Error placing order: ' + error.message
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
                .limit(limit);

            res.render('orders/orders', {
                title: 'My Orders',
                orders: orders,
                totalOrders: totalOrders, // Pass total count
                activeOrders: activeOrders, // Pass active count
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
    }
};

module.exports = orderController; 