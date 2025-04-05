const Order = require('../../models/Order');
const Product = require('../../models/product');
const Category = require('../../models/category');
const User = require('../../models/userModel');

exports.getDashboard = async (req, res) => {
    try {
        // Get filter period from query params (default to monthly)
        const period = req.query.period || 'monthly';
        
        // Initialize default values for all variables
        let salesData = [];
        let topProducts = [];
        let topCategories = [];
        let topBrands = [];
        let totalOrders = 0;
        let totalProducts = 0;
        let totalUsers = 0;
        let totalRevenue = 0;
        
        // Get counts for dashboard stats
        totalOrders = await Order.countDocuments();
        totalProducts = await Product.countDocuments();
        totalUsers = await User.countDocuments();
        
        // Calculate total revenue
        const revenue = await Order.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Returned'] } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        totalRevenue = revenue.length > 0 ? revenue[0].total : 0;
        
        // Get sales data based on period
        salesData = await getSalesData(period);
        
        // Get top 10 products
        topProducts = await getTopSellingProducts();
        
        // Get top 10 categories
        topCategories = await getTopSellingCategories();
        
        // Get top 10 brands
        topBrands = await getTopSellingBrands();
        
        // Get recent wallet transactions
        const recentWalletTransactions = await getRecentWalletTransactions();
        
        res.render('admin/dashboard', {
            title: 'Dashboard',
            path: '/admin/dashboard',
            totalOrders: totalOrders,
            totalRevenue: totalRevenue,
            totalProducts: totalProducts,
            totalUsers: totalUsers,
            salesData: salesData,
            topProducts: topProducts,
            topCategories: topCategories,
            topBrands: topBrands,
            period: period,
            recentWalletTransactions: recentWalletTransactions
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.render('admin/dashboard', {
            title: 'Dashboard',
            path: '/admin/dashboard',
            error: 'Failed to load dashboard data',
            totalOrders: 0,
            totalRevenue: 0,
            totalProducts: 0,
            totalUsers: 0,
            salesData: [],
            topProducts: [],
            topCategories: [],
            topBrands: [],
            period: 'monthly',
            recentWalletTransactions: []
        });
    }
};

// Helper function to get sales data based on period
async function getSalesData(period) {
    try {
        const now = new Date();
        let startDate, groupBy, dateFormat;
        
        // Set date range and grouping based on period
        switch(period) {
            case 'yearly':
                startDate = new Date(now.getFullYear() - 5, 0, 1); // Last 5 years
                groupBy = { $year: '$createdAt' };
                dateFormat = '%Y';
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1); // Last 12 months
                groupBy = { 
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                };
                dateFormat = '%Y-%m';
                break;
            case 'weekly':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7 * 10); // Last 10 weeks
                groupBy = { 
                    year: { $year: '$createdAt' },
                    week: { $week: '$createdAt' }
                };
                dateFormat = '%Y-W%V';
                break;
            case 'daily':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 30); // Last 30 days
                groupBy = { 
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    day: { $dayOfMonth: '$createdAt' }
                };
                dateFormat = '%Y-%m-%d';
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1); // Default to monthly
                groupBy = { 
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                };
                dateFormat = '%Y-%m';
        }
        
        // Aggregate sales data
        const salesData = await Order.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: startDate },
                    status: { $nin: ['Cancelled', 'Returned'] }
                } 
            },
            { 
                $group: {
                    _id: groupBy,
                    sales: { $sum: '$total' },
                    count: { $sum: 1 }
                } 
            },
            { 
                $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } 
            },
            {
                $project: {
                    _id: 0,
                    date: dateFormat === '%Y' 
                        ? { $toString: '$_id' }
                        : dateFormat === '%Y-%m'
                            ? { $concat: [{ $toString: '$_id.year' }, '-', { $toString: '$_id.month' }] }
                            : dateFormat === '%Y-W%V'
                                ? { $concat: [{ $toString: '$_id.year' }, '-W', { $toString: '$_id.week' }] }
                                : { $concat: [
                                    { $toString: '$_id.year' }, '-',
                                    { $toString: '$_id.month' }, '-',
                                    { $toString: '$_id.day' }
                                  ] },
                    sales: 1,
                    count: 1
                }
            }
        ]);
        
        return salesData;
    } catch (error) {
        console.error('Error getting sales data:', error);
        return [];
    }
}

// Helper function to get top 10 selling products
async function getTopSellingProducts() {
    try {
        console.log('Fetching top selling products...');
        
        const topProducts = await Order.aggregate([
            // Only include completed orders
            { $match: { status: { $in: ['Delivered', 'Completed'] } } },
            // Unwind the items array to work with individual items
            { $unwind: '$items' },
            // Group by product ID and calculate total sold and revenue
            { 
                $group: {
                    _id: '$items.product',
                    totalSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.finalPrice', '$items.quantity'] } }
                } 
            },
            // Sort by total sold in descending order
            { $sort: { totalSold: -1 } },
            // Limit to top 10
            { $limit: 10 },
            // Lookup product details
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            // Unwind the productDetails array
            { 
                $unwind: { 
                    path: '$productDetails',
                    preserveNullAndEmptyArrays: true
                } 
            },
            // Project only the fields we need
            {
                $project: {
                    _id: 1,
                    name: { $ifNull: ['$productDetails.name', 'Unknown Product'] },
                    totalSold: 1,
                    revenue: 1,
                }
            }
        ]);
        
        console.log(`Found ${topProducts.length} top products`);
        if (topProducts.length === 0) {
            console.log('No top products found. Creating sample data for display...');
           
        }
        
        return topProducts;
    } catch (error) {
        console.error('Error getting top products:', error);
        return [];
    }
}

// Helper function to get top 10 selling categories
async function getTopSellingCategories() {
    try {
        return await Order.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Returned'] } } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { 
                $unwind: { 
                    path: '$productDetails',
                    preserveNullAndEmptyArrays: true
                } 
            },
            { 
                $group: {
                    _id: '$productDetails.category',
                    totalSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.finalPrice', '$items.quantity'] } }
                } 
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'categoryDetails'
                }
            },
            { 
                $unwind: { 
                    path: '$categoryDetails',
                    preserveNullAndEmptyArrays: true
                } 
            },
            {
                $project: {
                    _id: 1,
                    name: { $ifNull: ['$categoryDetails.name', 'Unknown Category'] },
                    totalSold: 1,
                    revenue: 1
                }
            }
        ]);
    } catch (error) {
        console.error('Error getting top categories:', error);
        return [];
    }
}

// Helper function to get top 10 selling brands
async function getTopSellingBrands() {
    try {
        return await Order.aggregate([
            { $match: { status: { $nin: ['Cancelled', 'Returned'] } } },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.product',
                    foreignField: '_id',
                    as: 'productDetails'
                }
            },
            { 
                $unwind: { 
                    path: '$productDetails',
                    preserveNullAndEmptyArrays: true
                } 
            },
            { 
                $group: {
                    _id: '$productDetails.brand',
                    totalSold: { $sum: '$items.quantity' },
                    revenue: { $sum: { $multiply: ['$items.finalPrice', '$items.quantity'] } }
                } 
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 },
            {
                $project: {
                    _id: 0,
                    name: { $ifNull: ['$_id', 'Unknown Brand'] },
                    totalSold: 1,
                    revenue: 1
                }
            }
        ]);
    } catch (error) {
        console.error('Error getting top brands:', error);
        return [];
    }
}

// Helper function to get recent wallet transactions
async function getRecentWalletTransactions() {
    try {
        // Find all orders with payment method 'razorpay' or 'wallet'
        const orders = await Order.find({
            paymentMethod: { $in: ['razorpay', 'wallet'] },
            status: { $nin: ['Cancelled'] } // Exclude cancelled orders
        })
        .populate('user', 'name email')
        .sort({ createdAt: -1 }) // Sort by newest first
        .limit(10); // Get only the 10 most recent transactions
        
        // Transform orders into transaction format
        const transactions = orders.map(order => ({
            _id: order._id,
            date: order.createdAt,
            userName: order.user ? order.user.name : 'Unknown User',
            userEmail: order.user ? order.user.email : 'unknown@email.com',
            type: 'credit', // All successful orders are credits to admin wallet
            amount: order.total,
            description: `Payment received for Order #${order._id.toString().slice(-6).toUpperCase()} via ${order.paymentMethod}`,
            orderId: order._id
        }));
        
        // Get all types of refunds (full, partial, and return)
        const fullRefundOrders = await Order.find({
            refundProcessed: true
        })
        .populate('user', 'name email')
        .sort({ refundDate: -1 })
        .limit(10);
        
        const partialRefundOrders = await Order.find({
            partialRefundProcessed: true
        })
        .populate('user', 'name email')
        .sort({ partialRefundDate: -1 })
        .limit(10);
        
        const returnRefundOrders = await Order.find({
            returnRefundProcessed: true
        })
        .populate('user', 'name email')
        .sort({ returnRefundDate: -1 })
        .limit(10);
        
        // Transform full refunds into transaction format
        const fullRefundTransactions = fullRefundOrders.map(order => ({
            _id: order._id,
            date: order.refundDate,
            userName: order.user ? order.user.name : 'Unknown User',
            userEmail: order.user ? order.user.email : 'unknown@email.com',
            type: 'debit', // Refunds are debits from admin wallet
            amount: order.refundAmount,
            description: `Refund issued for cancelled Order #${order._id.toString().slice(-6).toUpperCase()}`,
            orderId: order._id
        }));
        
        // Transform partial refunds into transaction format
        const partialRefundTransactions = partialRefundOrders.map(order => ({
            _id: order._id,
            date: order.partialRefundDate,
            userName: order.user ? order.user.name : 'Unknown User',
            userEmail: order.user ? order.user.email : 'unknown@email.com',
            type: 'debit', // Refunds are debits from admin wallet
            amount: order.partialRefundAmount,
            description: `Partial refund issued for Order #${order._id.toString().slice(-6).toUpperCase()} (item removed)`,
            orderId: order._id
        }));
        
        // Transform return refunds into transaction format
        const returnRefundTransactions = returnRefundOrders.map(order => ({
            _id: order._id,
            date: order.returnRefundDate,
            userName: order.user ? order.user.name : 'Unknown User',
            userEmail: order.user ? order.user.email : 'unknown@email.com',
            type: 'debit', // Refunds are debits from admin wallet
            amount: order.returnRefundAmount,
            description: `Refund issued for returned item in Order #${order._id.toString().slice(-6).toUpperCase()}`,
            orderId: order._id
        }));
        
        // Combine all types of transactions
        let allTransactions = [
            ...transactions,
            ...fullRefundTransactions,
            ...partialRefundTransactions,
            ...returnRefundTransactions
        ];
        
        // Sort by date (newest first)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Return the 10 most recent transactions
        return allTransactions.slice(0, 10);
    } catch (error) {
        console.error('Error getting admin wallet transactions:', error);
        return [];
    }
}

// Add a new route handler for wallet management
exports.getWalletManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20; // Transactions per page
        const skip = (page - 1) * limit;
        
        // Get filter parameters
        const searchUser = req.query.searchUser || '';
        const transactionType = req.query.transactionType || '';
        const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
        const dateTo = req.query.dateTo ? new Date(req.query.dateTo + 'T23:59:59') : null; // Set to end of day
        
        // Build filter object
        const orderFilter = {};
        
        // Add payment method filter (only include razorpay and wallet payments)
        orderFilter.paymentMethod = { $in: ['razorpay', 'wallet'] };
        
        // Add date filter if provided
        if (dateFrom || dateTo) {
            orderFilter.createdAt = {};
            if (dateFrom) orderFilter.createdAt.$gte = dateFrom;
            if (dateTo) orderFilter.createdAt.$lte = dateTo;
        }
        
        // Add user search if provided
        let userIds = [];
        if (searchUser) {
            const users = await User.find({
                $or: [
                    { name: { $regex: searchUser, $options: 'i' } },
                    { email: { $regex: searchUser, $options: 'i' } }
                ]
            });
            userIds = users.map(user => user._id);
            if (userIds.length > 0) {
                orderFilter.user = { $in: userIds };
            } else {
                // No users found matching the search criteria
                return res.render('admin/wallet-management', {
                    title: 'Wallet Management',
                    path: '/admin/wallet-management',
                    transactions: [],
                    currentPage: 1,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPrevPage: false,
                    nextPage: 1,
                    prevPage: 1,
                    totalTransactions: 0,
                    filters: { searchUser, transactionType, dateFrom, dateTo }
                });
            }
        }
        
        // Get orders based on filters
        let orders = await Order.find(orderFilter)
            .populate('user', 'name email')
            .sort({ createdAt: -1 });
            
        // Get refund orders (cancelled or returned with refund processed)
        const refundFilter = { 
            status: { $in: ['Cancelled', 'Returned'] },
            refundProcessed: true
        };
        
        // Apply the same date and user filters to refunds
        if (dateFrom || dateTo) {
            refundFilter.updatedAt = {};
            if (dateFrom) refundFilter.updatedAt.$gte = dateFrom;
            if (dateTo) refundFilter.updatedAt.$lte = dateTo;
        }
        
        if (userIds.length > 0) {
            refundFilter.user = { $in: userIds };
        }
        
        const refundOrders = await Order.find(refundFilter)
            .populate('user', 'name email')
            .sort({ updatedAt: -1 });
        
        // Transform orders into transaction format
        let transactions = orders.map(order => ({
            _id: order._id,
            date: order.createdAt,
            userName: order.user ? order.user.name : 'Unknown User',
            userEmail: order.user ? order.user.email : 'unknown@email.com',
            type: 'credit', // All successful orders are credits to admin wallet
            amount: order.total,
            balance: 0, // Will calculate running balance later
            description: `Payment received for Order #${order._id.toString().slice(-6).toUpperCase()} via ${order.paymentMethod}`,
            orderId: order._id,
            paymentMethod: order.paymentMethod
        }));
        
        // Add refund transactions
        const refundTransactions = refundOrders.map(order => ({
            _id: order._id,
            date: order.updatedAt, // Use the update time as the refund time
            userName: order.user ? order.user.name : 'Unknown User',
            userEmail: order.user ? order.user.email : 'unknown@email.com',
            type: 'debit', // Refunds are debits from admin wallet
            amount: order.total,
            balance: 0, // Will calculate running balance later
            description: `Refund issued for Order #${order._id.toString().slice(-6).toUpperCase()} (${order.status})`,
            orderId: order._id,
            paymentMethod: 'refund'
        }));
        
        // Combine both types of transactions
        let allTransactions = [...transactions, ...refundTransactions];
        
        // Filter by transaction type if specified
        if (transactionType) {
            allTransactions = allTransactions.filter(t => t.type === transactionType);
        }
        
        // Sort by date (newest first)
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Calculate running balance
        let runningBalance = 0;
        // First sort by date (oldest first) to calculate balance correctly
        const oldestFirst = [...allTransactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        oldestFirst.forEach(transaction => {
            if (transaction.type === 'credit') {
                runningBalance += transaction.amount;
            } else {
                runningBalance -= transaction.amount;
            }
            transaction.balance = runningBalance;
        });
        
        // Resort to newest first for display
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Calculate total number of transactions and pages
        const totalTransactions = allTransactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);
        
        // Get paginated transactions
        const paginatedTransactions = allTransactions.slice(skip, skip + limit);
        
        // Calculate total revenue (credits - debits)
        const totalCredits = allTransactions.filter(t => t.type === 'credit')
            .reduce((sum, t) => sum + t.amount, 0);
        const totalDebits = allTransactions.filter(t => t.type === 'debit')
            .reduce((sum, t) => sum + t.amount, 0);
        const netRevenue = totalCredits - totalDebits;
        
        res.render('admin/wallet-management', {
            title: 'Wallet Management',
            path: '/admin/wallet-management',
            transactions: paginatedTransactions,
            currentPage: page,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            totalTransactions: totalTransactions,
            totalCredits: totalCredits,
            totalDebits: totalDebits,
            netRevenue: netRevenue,
            currentBalance: runningBalance,
            filters: { searchUser, transactionType, dateFrom, dateTo }
        });
    } catch (error) {
        console.error('Error loading wallet management:', error);
        res.render('admin/wallet-management', {
            title: 'Wallet Management',
            path: '/admin/wallet-management',
            error: 'Failed to load wallet data',
            transactions: [],
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
            nextPage: 1,
            prevPage: 1,
            totalTransactions: 0,
            totalCredits: 0,
            totalDebits: 0,
            netRevenue: 0,
            currentBalance: 0,
            filters: { searchUser: '', transactionType: '', dateFrom: null, dateTo: null }
        });
    }
};