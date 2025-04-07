const Order = require('../../models/Order');
const User = require('../../models/userModel');
const Wallet = require('../../models/walletModel');
const mongoose = require('mongoose');
const Product = require('../../models/product');

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
                    // Handle error silently
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

            res.render('admin/orders', {
                title: 'Orders',
                orders: orders,
                totalOrders: totalOrders,
                currentPage: page,
                totalPages: totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1,
                statusStages: statusStages,
                path: '/admin/orders',
                searchQuery: {
                    orderId: req.query.orderId || '',
                    customerName: req.query.customerName || ''
                }
            });

        } catch (error) {
            req.flash('error', 'Error fetching orders');
            res.redirect('/admin/dashboard');
        }
    },

    updateOrderStatus: async (req, res) => {
        try {
            // Check both params and body for the order ID
            const orderId = req.params.id || req.body.id;
            const { status } = req.body;
            
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    message: 'Order ID is required'
                });
            }
            
            // Validate status
            const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status'
                });
            }
            
            // Find the order with more detailed error handling
            if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order ID format'
                });
            }
            
            const order = await Order.findById(orderId);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }
            
            // Update order status
            order.status = status;
            
            // If order is delivered and payment method is COD, update payment status to Completed
            if (status === 'Delivered' && order.paymentMethod === 'cod') {
                order.paymentStatus = 'Completed';
            }
            
            // Save the updated order
            await order.save();
            
            return res.json({
                success: true,
                message: 'Order status updated successfully'
            });
            
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Server error: ' + error.message
            });
        }
    },

    handleReturn: async (req, res) => {
        try {
            const { orderId, itemIndex } = req.params;
            const { status } = req.body;

            const order = await Order.findById(orderId)
                .populate('user')
                .populate('items.product');
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            // Check if this is an item-level return or order-level return
            if (itemIndex !== undefined) {
                // Item-level return
                if (itemIndex < 0 || itemIndex >= order.items.length) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid item index'
                    });
                }

                const item = order.items[itemIndex];
                
                // Check if item has a pending return
                if (item.returnStatus !== 'pending') {
                    return res.status(400).json({
                        success: false,
                        message: 'Item does not have a pending return request'
                    });
                }

                // Update item return status
                item.returnStatus = status === 'accepted' ? 'accepted' : 'rejected';
                item.returnProcessedDate = new Date();
                
                // Process refund if return is accepted
                if (status === 'accepted' && order.paymentStatus === 'Completed') {
                    try {
                        // Find user's wallet
                        const userId = order.user._id;
                        let wallet = await Wallet.findOne({ userId });
                        
                        if (!wallet) {
                            // Create wallet if it doesn't exist
                            wallet = new Wallet({
                                userId,
                                balance: 0,
                                transactions: []
                            });
                        }
                        
                        // Calculate refund amount based on item price and quantity
                        let refundAmount = item.finalPrice * item.quantity;
                        
                        // Calculate proportional GST for the item
                        if (order.subtotal > 0) {
                            const itemRatio = (item.finalPrice * item.quantity) / order.subtotal;
                            const proportionalGst = order.gst * itemRatio;
                            
                            // Add proportional GST to the refund amount
                            refundAmount += proportionalGst;
                            
                            let shippingRefund = 0;
                            if (order.items.length === 1) {
                                // Only one item in the order - refund full shipping
                                shippingRefund = order.shippingFee;
                                refundAmount += shippingRefund;
                            }
                        }
                        
                        // Round to 2 decimal places
                        refundAmount = Math.round(refundAmount * 100) / 100;
                        
                        // Calculate new balance
                        const newBalance = wallet.balance + refundAmount;
                        
                        // Add refund transaction to wallet
                        wallet.transactions.push({
                            type: 'credit',
                            amount: refundAmount,
                            description: `Refund for returned item in order #${order._id.toString().slice(-6).toUpperCase()}`,
                            orderId: order._id,
                            date: new Date(),
                            balance: newBalance,
                            userId
                        });
                        
                        // Update wallet balance
                        wallet.balance = newBalance;
                        
                        // Save wallet changes
                        await wallet.save();
                        
                        // Restore stock for the returned product
                        try {
                            const productItem = await Product.findById(item.product);
                            if (productItem && productItem.variants[item.variant]) {
                                productItem.variants[item.variant].stock += item.quantity;
                                await productItem.save();
                            }
                        } catch (stockError) {
                            // Silently handle error
                        }
                    } catch (refundError) {
                        // Continue with order update even if refund fails
                    }
                }
            } else {
                // Order-level return
                order.returnStatus = status === 'accept' ? 'accepted' : 'rejected';
                order.status = status === 'accept' ? 'Return Accepted' : 'Delivered';

                // Process refund if return is accepted and payment was completed
                if (status === 'accept' && order.paymentStatus === 'Completed') {
                    try {
                        // Find user's wallet
                        const userId = order.user._id;
                        let wallet = await Wallet.findOne({ userId });
                        
                        if (!wallet) {
                            // Silently handle error
                        } else {
                            // For full-order return, use the total order amount
                            const refundAmount = order.total + 500;
                            
                            // Calculate new balance
                            const newBalance = wallet.balance + refundAmount;
                            
                            // Add refund transaction to wallet
                            wallet.transactions.push({
                                type: 'credit',
                                amount: refundAmount,
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
                        }
                    } catch (refundError) {
                        // Continue with order update even if refund fails
                    }
                }
            }

            // Save the updated order
            await order.save();
            
            return res.json({
                success: true,
                message: `Return request ${status === 'accepted' || status === 'accept' ? 'accepted' : 'rejected'} successfully`
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error handling return request: ' + error.message
            });
        }
    }
};

module.exports = OrderController;