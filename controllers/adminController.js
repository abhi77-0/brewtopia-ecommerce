// adminController.js
require('dotenv').config();
const User = require('../models/userModel');
const Category = require('../models/category');
const Product = require('../models/product');

// Admin authentication controllers
const getLoginPage = (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { 
        error: req.query.error,
        title: 'Admin Login',
        path: '/admin/login'
    });
};

const adminLogin = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        console.log('Login attempt for:', email);
        
        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            // Set admin session
            req.session.isAdmin = true;
            req.session.adminUser = {
                email: email,
                name: process.env.ADMIN_NAME || 'Admin',
                role: 'admin'
            };
            
            // Save session before redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.render('admin/login', { 
                        error: 'Login failed, please try again',
                        title: 'Admin Login',
                        path: '/admin/login'
                    });
                }
                console.log('Admin login successful:', email);
                res.redirect('/admin/dashboard');
            });
        } else {
            console.log('Invalid credentials');
            res.render('admin/login', { 
                error: 'Invalid credentials',
                title: 'Admin Login',
                path: '/admin/login'
            });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.render('admin/login', {
            error: 'Login failed, please try again',
            title: 'Admin Login',
            path: '/admin/login'
        });
    }
};

const adminLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/admin/login');
    });
};

// Dashboard controllers
const getDashboardStats = async () => {
    try {
        const totalProducts = await Product.countDocuments();
        const totalUsers = await User.countDocuments();
        // You would need to add Order model and related logic here
        
        return {
            totalProducts,
            newOrders: 0, // Replace with actual logic when Order model is available
            totalUsers,
            totalRevenue: 0 // Replace with actual logic when Order model is available
        };
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        return {
            totalProducts: 0,
            newOrders: 0,
            totalUsers: 0,
            totalRevenue: 0
        };
    }
};

const getDashboard = async (req, res) => {
    try {
        const stats = await getDashboardStats();
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            adminUser: req.session.adminUser,
            path: '/admin/dashboard',
            stats
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('admin/login', {
            error: 'Error loading dashboard',
            title: 'Admin Login',
            path: '/admin/login'
        });
    }
};

// User management controllers
const getUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.render('admin/users', {
            title: 'Manage Users',
            adminUser: req.session.adminUser,
            path: '/admin/users',
            users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).render('admin/users', {
            title: 'Manage Users',
            adminUser: req.session.adminUser,
            path: '/admin/users',
            users: []
        });
    }
};

const toggleUserBlockStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.blocked = !user.blocked;
        await user.save();

        res.json({ message: `User has been ${user.blocked ? 'blocked' : 'unblocked'}` });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
};

// Category management controllers
const getCategories = async (req, res) => {
    try {
        const categories = await Category.find();
        const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
            const productCount = await Product.countDocuments({ category: category._id });
            return {
                ...category.toObject(),
                productCount
            };
        }));

        res.render('admin/categories', {
            title: 'Manage Categories',
            adminUser: req.session.adminUser,
            path: '/admin/categories',
            categories: categoriesWithCounts
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).render('admin/categories', {
            title: 'Manage Categories',
            adminUser: req.session.adminUser,
            path: '/admin/categories',
            categories: []
        });
    }
};

// Product management controllers
const toggleProductVisibility = async (req, res) => {
    const { productId } = req.params;

    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        product.hidden = !product.hidden;
        await product.save();

        res.status(200).json({ 
            message: `Product has been ${product.hidden ? 'hidden' : 'unhidden'}.`,
            hidden: product.hidden
        });
    } catch (error) {
        console.error('Error toggling product visibility:', error);
        res.status(500).json({ error: 'Failed to update product visibility' });
    }
};

// Order management controllers
const getOrders = (req, res) => {
    // Replace with actual order fetching logic when Order model is available
    res.render('admin/orders', {
        title: 'Manage Orders',
        adminUser: req.session.adminUser,
        path: '/admin/orders',
        orders: []
    });
};

const updateOrderStatus = (req, res) => {
    // Implement order status update logic when Order model is available
    res.status(501).json({ message: 'Not implemented yet' });
};

module.exports = {
    // Auth controllers
    getLoginPage,
    adminLogin,
    adminLogout,
    
    // Dashboard controllers
    getDashboard,
    
    // User management controllers
    getUsers,
    toggleUserBlockStatus,
    
    // Category management controllers
    getCategories,
    
    // Product management controllers
    toggleProductVisibility,
    
    // Order management controllers
    getOrders,
    updateOrderStatus
};