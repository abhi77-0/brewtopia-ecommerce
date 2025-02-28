const express = require('express');
const router = express.Router();

// Admin authentication middleware
const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.isAdmin) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Admin login page
router.get('/login', (req, res) => {
    if (req.session.user && req.session.user.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { 
        error: req.query.error,
        user: null
    });
});

// Admin login handler
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Add your admin authentication logic here
        // For now, using a simple check (you should replace this with proper DB validation)
        if (email === 'admin@brewtopia.com' && password === 'admin123') {
            req.session.user = {
                id: 'admin1',
                email: email,
                name: 'Admin',
                isAdmin: true
            };
            return res.redirect('/admin/dashboard');
        }
        res.redirect('/admin/login?error=Invalid credentials');
    } catch (error) {
        res.redirect('/admin/login?error=' + encodeURIComponent(error.message));
    }
});

// Admin dashboard
router.get('/dashboard', isAdmin, (req, res) => {
    res.render('admin/dashboard', {
        user: req.session.user,
        title: 'Admin Dashboard'
    });
});

// Product management routes
router.get('/products', isAdmin, (req, res) => {
    res.render('admin/products', {
        user: req.session.user,
        title: 'Manage Products'
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

// Order management routes
router.get('/orders', isAdmin, (req, res) => {
    res.render('admin/orders', {
        user: req.session.user,
        title: 'Manage Orders'
    });
});

router.put('/orders/:id/status', isAdmin, (req, res) => {
    // Update order status logic
});

// User management routes
router.get('/users', isAdmin, (req, res) => {
    res.render('admin/users', {
        user: req.session.user,
        title: 'Manage Users'
    });
});

// Admin logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/admin/login');
    });
});

module.exports = router; 