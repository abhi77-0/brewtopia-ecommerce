const Order = require('../../models/Order');

const OrderController = {
    getAllOrders: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 10; // Orders per page for admin

            // Define possible order statuses
            const statusStages = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

            // Get total order count
            const totalOrders = await Order.countDocuments();

            // Calculate pagination
            const totalPages = Math.ceil(totalOrders / limit);

            // Fetch paginated orders
            const orders = await Order.find()
                .populate({
                    path: 'items.product',
                    select: 'name images brand variants'
                })
                .populate('user', 'name email') // Include user details
                .populate('address')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit);

            res.render('admin/orders', {
                title: 'Manage Orders',
                orders: orders,
                totalOrders: totalOrders,
                currentPage: page,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1,
                statusStages: statusStages // Pass status stages to the view
            });

        } catch (error) {
            console.error('Error fetching orders:', error);
            req.flash('error', 'Error fetching orders');
            res.redirect('/admin/dashboard');
        }
    },

    updateOrderStatus: async (req, res) => {
        try {
            const orderId = req.params.id;
            const { status } = req.body;

            // Ensure the status is one of the allowed values
            if (!['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status value'
                });
            }

            const order = await Order.findByIdAndUpdate(orderId, { status }, { new: true });

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            res.json({
                success: true,
                message: 'Order status updated successfully',
                order
            });

        } catch (error) {
            console.error('Error updating order status:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating order status: ' + error.message
            });
        }
    }
};

module.exports = OrderController;