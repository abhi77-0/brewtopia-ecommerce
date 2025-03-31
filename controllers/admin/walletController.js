const User = require('../../models/userModel');
const Transaction = require('../../models/Transaction');
const Order = require('../../models/Order');
const mongoose = require('mongoose');

// Display list of all wallet transactions
exports.getAllTransactions = async (req, res) => {
    try {
        // Get page number and limit
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Get filter parameters
        const userId = req.query.userId;
        const transactionType = req.query.type;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        
        // Build filter object
        let filter = {};
        
        if (userId) {
            filter.user = mongoose.Types.ObjectId(userId);
        }
        
        if (transactionType) {
            filter.type = transactionType;
        }
        
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) {
                filter.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = endDateObj;
            }
        }
        
        // Get total count for pagination
        const totalTransactions = await Transaction.countDocuments(filter);
        
        // Get transactions with pagination
        const transactions = await Transaction.find(filter)
            .populate('user', 'name email phone')
            .populate('order', 'orderNumber')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        // Get all users for filter dropdown
        const users = await User.find({}, 'name email');
        
        // Calculate pagination values
        const totalPages = Math.ceil(totalTransactions / limit);
        
        res.render('admin/wallet/transactions', {
            title: 'Wallet Transactions',
            transactions,
            users,
            currentPage: page,
            totalPages,
            totalTransactions,
            filter: {
                userId,
                transactionType,
                startDate,
                endDate
            }
        });
    } catch (error) {
        console.error('Error fetching wallet transactions:', error);
        req.flash('error', 'Failed to fetch wallet transactions');
        res.redirect('/admin/dashboard');
    }
};

// Display details of a specific transaction
exports.getTransactionDetails = async (req, res) => {
    try {
        const transactionId = req.params.id;
        
        const transaction = await Transaction.findById(transactionId)
            .populate('user', 'name email phone walletBalance')
            .populate('order', 'orderNumber totalAmount paymentMethod status items')
            .populate({
                path: 'order',
                populate: {
                    path: 'items.product',
                    select: 'name'
                }
            });
        
        if (!transaction) {
            req.flash('error', 'Transaction not found');
            return res.redirect('/admin/wallet/transactions');
        }
        
        res.render('admin/wallet/transaction-details', {
            title: 'Transaction Details',
            transaction
        });
    } catch (error) {
        console.error('Error fetching transaction details:', error);
        req.flash('error', 'Failed to fetch transaction details');
        res.redirect('/admin/wallet/transactions');
    }
};

// Get wallet statistics for dashboard
exports.getWalletStats = async (req, res) => {
    try {
        // Total wallet balance across all users
        const totalWalletBalance = await User.aggregate([
            { $group: { _id: null, total: { $sum: "$walletBalance" } } }
        ]);
        
        // Total transactions count
        const totalTransactions = await Transaction.countDocuments();
        
        // Transactions by type
        const transactionsByType = await Transaction.aggregate([
            { $group: { _id: "$type", count: { $sum: 1 }, total: { $sum: "$amount" } } }
        ]);
        
        // Recent transactions
        const recentTransactions = await Transaction.find()
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .limit(5);
        
        // Monthly transaction totals for chart
        const monthlyStats = await Transaction.aggregate([
            {
                $group: {
                    _id: { 
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    credit: {
                        $sum: {
                            $cond: [
                                { $in: ["$type", ["refund", "cashback", "promotion"]] },
                                "$amount",
                                0
                            ]
                        }
                    },
                    debit: {
                        $sum: {
                            $cond: [
                                { $eq: ["$type", "purchase"] },
                                "$amount",
                                0
                            ]
                        }
                    }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);
        
        res.json({
            totalWalletBalance: totalWalletBalance[0]?.total || 0,
            totalTransactions,
            transactionsByType,
            recentTransactions,
            monthlyStats
        });
    } catch (error) {
        console.error('Error fetching wallet statistics:', error);
        res.status(500).json({ error: 'Failed to fetch wallet statistics' });
    }
}; 