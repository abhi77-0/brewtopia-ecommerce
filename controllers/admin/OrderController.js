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
            // Check both params and body for the order ID
            const orderId = req.params.id || req.body.id;
            const { status } = req.body;
            
            console.log('Request params:', req.params);
            console.log('Request body:', req.body);
            console.log(`Attempting to update order ${orderId} to status: ${status}`);
            
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
                console.error(`Invalid order ID format: ${orderId}`);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order ID format'
                });
            }
            
            const order = await Order.findById(orderId);
            
            if (!order) {
                console.error(`Order not found with ID: ${orderId}`);
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }
            
            console.log(`Found order: ${order._id}, current status: ${order.status}, payment method: ${order.paymentMethod}`);
            
            // Update order status
            order.status = status;
            
            // If order is delivered and payment method is COD, update payment status to Completed
            if (status === 'Delivered' && order.paymentMethod === 'cod') {
                order.paymentStatus = 'Completed';
                console.log(`Order ${orderId} marked as Delivered - updating COD payment status to Completed`);
            }
            
            // Save the updated order
            await order.save();
            console.log(`Order ${orderId} successfully updated to status: ${status}`);
            
            return res.json({
                success: true,
                message: 'Order status updated successfully'
            });
            
        } catch (error) {
            console.error('Error updating order status:', error);
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

            console.log('Processing return request:', { orderId, itemIndex, status });

            const order = await Order.findById(orderId).populate('user');
            
            if (!order) {
                console.log('Order not found:', orderId);
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
                
                console.log(`Updated item return status to: ${item.returnStatus}`);
                
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
                        
                        // Calculate refund amount (price * quantity)
                        const refundAmount = item.price * item.quantity;
                        
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
                        console.log(`Refund processed: ${refundAmount} added to wallet for user ${userId}`);
                        
                        // Restore stock for the returned product
                        try {
                            const productItem = await Product.findById(item.product);
                            if (productItem && productItem.variants[item.variant]) {
                                productItem.variants[item.variant].stock += item.quantity;
                                await productItem.save();
                                console.log(`Stock restored for product ${item.product}, variant ${item.variant}, quantity ${item.quantity}`);
                            }
                        } catch (stockError) {
                            console.error('Error restoring stock:', stockError);
                        }
                    } catch (refundError) {
                        console.error('Error processing refund:', refundError);
                        // Continue with order update even if refund fails
                    }
                }
            } else {
                // Order-level return (original functionality)
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
                        const userId = order.user._id;
                        let wallet = await Wallet.findOne({ userId });
                        
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
            }

            // Save the updated order
            await order.save();
            
            return res.json({
                success: true,
                message: `Return request ${status === 'accepted' || status === 'accept' ? 'accepted' : 'rejected'} successfully`
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
    },

    processItemReturn: async (req, res) => {
        try {
            const { orderId, itemIndex } = req.params;
            const { status } = req.body;
            
            console.log(`Processing item return - Order ID: ${orderId}, Item Index: ${itemIndex}, Status: ${status}`);
            
            // Find the order
            const order = await Order.findById(orderId)
                .populate('user')
                .populate('items.product');
            
            if (!order) {
                console.error(`Order not found: ${orderId}`);
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }
            
            // Check if item index is valid
            if (itemIndex < 0 || itemIndex >= order.items.length) {
                console.error(`Invalid item index: ${itemIndex}`);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid item index'
                });
            }
            
            // Get the item
            const item = order.items[itemIndex];
            
            // Check if item has a pending return
            if (item.returnStatus !== 'pending') {
                console.error(`Item does not have a pending return: ${itemIndex}`);
                return res.status(400).json({
                    success: false,
                    message: 'Item does not have a pending return'
                });
            }
            
            // Update item return status
            item.returnStatus = status === 'accepted' ? 'accepted' : 'rejected';
            item.returnProcessedDate = new Date();
            
            console.log(`Updated item return status to: ${item.returnStatus}`);
            
            // Process refund if return is accepted
            if (status === 'accepted') {
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
                    
                    // Calculate refund amount (price * quantity)
                    const refundAmount = item.price * item.quantity;
                    
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
                    console.log(`Refund processed: ${refundAmount} added to wallet for user ${userId}`);
                    
                    // Restore stock for the returned product
                    const product = await product.findById(item.product);
                    if (product && product.variants[item.variant]) {
                        product.variants[item.variant].stock += item.quantity;
                        await product.save();
                        console.log(`Stock restored for product ${item.product}, variant ${item.variant}, quantity ${item.quantity}`);
                    }
                } catch (refundError) {
                    console.error('Error processing refund:', refundError);
                    // Continue with order update even if refund fails
                }
            }
            
            // Save the updated order
            await order.save();
            
            return res.json({
                success: true,
                message: `Return ${status === 'accepted' ? 'accepted' : 'rejected'} successfully`
            });
            
        } catch (error) {
            console.error('Error processing item return:', error);
            return res.status(500).json({
                success: false,
                message: 'Error processing item return: ' + error.message
            });
        }
    }
};

module.exports = OrderController;