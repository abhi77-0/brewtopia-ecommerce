const Order = require('../../models/Order');
const User = require('../../models/userModel');
const Wallet = require('../../models/walletModel');
const mongoose = require('mongoose');
const product=require('../../models/Product');


const OrderController = {
    getAllOrders: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 10;

            // Build search query
            let searchQuery = {};

            // Search by Order ID
            if (req.query.orderId && req.query.orderId.trim() !== '') {
                try {
                    const cleanOrderId = req.query.orderId.replace('#', '').trim();
                    if (mongoose.Types.ObjectId.isValid(cleanOrderId)) {
                        searchQuery._id = new mongoose.Types.ObjectId(cleanOrderId);
                    }
                } catch (err) {
                    console.log('Invalid Order ID format:', err);
                }
            }

            // Search by Customer Name
            if (req.query.customerName && req.query.customerName.trim() !== '') {
                const users = await User.find({
                    name: { $regex: new RegExp(req.query.customerName, 'i') }
                });
                
                if (users.length > 0) {
                    searchQuery.user = { $in: users.map(user => user._id) };
                }
            }

            const statusStages = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

            // Get total orders count
            const totalOrders = await Order.countDocuments(searchQuery);
            const totalPages = Math.ceil(totalOrders / limit);

            // Fetch orders
            const orders = await Order.find(searchQuery)
                .populate({
                    path: 'items.product',
                    select: 'name images brand variants'
                })
                .populate('user', 'name email')
                .populate('address')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit);

            console.log('Search Query:', searchQuery);
            console.log('Found Orders:', orders.length);

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
                statusStages: statusStages,
                searchQuery: {
                    orderId: req.query.orderId || '',
                    customerName: req.query.customerName || ''
                }
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

            const order = await Order.findById(orderId).populate('user');
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

            // Process refund if return is accepted and payment was completed
            if (status === 'accept' && order.paymentStatus === 'Completed') {
                try {
                    // Find user's wallet
                    const userId = order.user._id || order.user;
                    const wallet = await Wallet.findOne({ userId });
                    
                    if (!wallet) {
                        console.error('Wallet not found for user:', userId);
                    } else {
                        // Calculate new balance
                        const newBalance = wallet.balance + order.total;
                        
                        // Add refund transaction to wallet
                        wallet.transactions.push({
                            type: 'credit',
                            amount: order.total,
                            description: `Refund for returned order #${order._id.toString().slice(-6).toUpperCase()}`,
                            orderId: order._id,
                            date: new Date(),
                            balance: newBalance,
                            userId
                        });
                        
                        // Update wallet balance
                        wallet.balance = newBalance;
                        
                        // Save wallet changes
                        await wallet.save();
                        
                        // Update order payment status to reflect refund
                        order.paymentStatus = 'Refunded';
                        
                        console.log(`Refund processed: ${order.total} added to wallet for user ${userId}`);
                    }
                } catch (refundError) {
                    console.error('Error processing refund:', refundError);
                    // Continue with order update even if refund fails
                    // We can implement a retry mechanism or manual intervention later
                }
            }

            await order.save();
            console.log('Order updated successfully');

            res.json({
                success: true,
                message: `Return request ${status}ed successfully${status === 'accept' ? ' and refund processed' : ''}`
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