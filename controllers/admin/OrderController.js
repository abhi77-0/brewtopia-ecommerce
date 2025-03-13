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
    },

    handleReturn: async (req, res) => {
        console.log('handleReturn controller method called:', {
            params: req.params,
            body: req.body,
            user: req.user
        });

        try {
            const { orderId } = req.params;
            const { status } = req.body;

            console.log('Processing return request:', { orderId, status });

            const order = await Order.findById(orderId);
            console.log('Found order:', order ? 'yes' : 'no', {
                orderId: order?._id,
                currentStatus: order?.status,
                returnStatus: order?.returnStatus
            });

            if (!order) {
                console.log('Order not found:', orderId);
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Update return status based on admin action
            order.returnStatus = status === 'accept' ? 'accepted' : 'rejected';
            order.status = status === 'accept' ? 'Return Accepted' : 'Delivered';

            console.log('Updating order with:', {
                returnStatus: order.returnStatus,
                status: order.status
            });

            await order.save();
            console.log('Order updated successfully');

            res.json({
                success: true,
                message: `Return request ${status}ed successfully`
            });

        } catch (error) {
            console.error('Error in handleReturn:', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                message: 'Error handling return request: ' + error.message
            });
        }
    }
};

module.exports = OrderController;