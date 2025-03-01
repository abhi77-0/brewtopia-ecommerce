const express = require('express');
const router = express.Router();

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Admin login page
router.get('/login', (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { 
        error: req.query.error,
        title: 'Admin Login'
    });
});

// Admin login handler
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        // Set admin session
        req.session.isAdmin = true;
        req.session.adminUser = {
            email: email,
            role: 'admin'
        };
        // Save session before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.render('admin/login', { 
                    error: 'Login failed, please try again',
                    title: 'Admin Login'
                });
            }
            res.redirect('/admin/dashboard');
        });
    } else {
        res.render('admin/login', { 
            error: 'Invalid credentials',
            title: 'Admin Login'
        });
    }
});

// Admin logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/admin/login');
    });
});

// Admin dashboard
router.get('/dashboard', isAdmin, (req, res) => {
    try {
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            adminUser: req.session.adminUser,
            stats: {
                totalProducts: 0,
                newOrders: 0,
                totalUsers: 0,
                totalRevenue: 0
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('admin/login', {
            error: 'Error loading dashboard',
            title: 'Admin Login'
        });
    }
});

// Products management
router.get('/products', isAdmin, (req, res) => {
    res.render('admin/products', {
        title: 'Manage Products',
        adminUser: req.session.adminUser,
        products: []
    });
});

router.post('/products/add', isAdmin, (req, res) => {
    // Add product logic
});

router.put('/products/:id', isAdmin, (req, res) => {
    // Update product logic
});

router.delete('/products/:id', isAdmin, (req, res) => {
    // Delete product logic
});

// Users management
router.get('/users', isAdmin, (req, res) => {
    res.render('admin/users', {
        title: 'Manage Users',
        adminUser: req.session.adminUser,
        users: []
    });
});

// Categories management
router.get('/categories', isAdmin, (req, res) => {
    res.render('admin/categories', {
        title: 'Manage Categories',
        adminUser: req.session.adminUser,
        categories: []
    });
});

// Order management routes
router.get('/orders', isAdmin, (req, res) => {
    res.render('admin/orders', {
        title: 'Manage Orders',
        user: req.session.user
    });
});

router.put('/orders/:id/status', isAdmin, (req, res) => {
    // Update order status logic
});

module.exports = router; 