const express = require('express');
const router = express.Router();
const multer = require('multer');
const categoryController = require('../controllers/categoryController');
const productController = require('../controllers/productController');
const User = require('../models/userModel'); // Adjust the path as necessary
const Category = require('../models/category'); // Assuming you have a Category model
const Product = require('../models/product'); // Assuming you have a Product model

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
    if (req.session.adminUser) {
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
        title: 'Admin Login',
        path: '/admin/login'
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
                    title: 'Admin Login',
                    path: '/admin/login'
                });
            }
            res.redirect('/admin/dashboard');
        });
    } else {
        res.render('admin/login', { 
            error: 'Invalid credentials',
            title: 'Admin Login',
            path: '/admin/login'
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
            path: '/admin/dashboard',
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
            title: 'Admin Login',
            path: '/admin/login'
        });
    }
});

// Products management
router.get('/products', isAdmin, productController.getAllProducts);
router.get('/products/:productId', isAdmin, productController.getProduct);
router.post('/products/add', isAdmin, upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 }
]), productController.addProduct);
router.put('/products/:productId', isAdmin, upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 }
]), productController.editProduct);
router.delete('/products/:productId', isAdmin, productController.deleteProduct);

// Route to hide a product
router.put('/products/:productId/hide', isAdmin, async (req, res) => {
    const { productId } = req.params;

    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Toggle the hidden status
        product.hidden = !product.hidden;
        await product.save();

        res.status(200).json({ message: `Product has been ${product.hidden ? 'hidden' : 'unhidden'}.` });
    } catch (error) {
        console.error('Error hiding product:', error);
        res.status(500).json({ error: 'Failed to hide product' });
    }
});

// Users management
router.get('/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find(); // Fetch all users from the database
        res.render('admin/users', {
            title: 'Manage Users',
            adminUser: req.session.adminUser,
            path: '/admin/users',
            users: users // Pass users to the EJS template
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).render('admin/users', {
            title: 'Manage Users',
            adminUser: req.session.adminUser,
            path: '/admin/users',
            users: [] // Pass an empty array on error
        });
    }
});

// Categories management
router.get('/categories', isAdmin, async (req, res) => {
    try {
        const categories = await Category.find(); // Fetch all categories from the database
        const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
            const productCount = await Product.countDocuments({ category: category._id }); // Count products in each category
            return {
                ...category.toObject(),
                productCount: productCount
            };
        }));

        res.render('admin/categories', {
            title: 'Manage Categories',
            adminUser: req.session.adminUser,
            path: '/admin/categories',
            categories: categoriesWithCounts // Pass categories with product counts to the EJS template
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).render('admin/categories', {
            title: 'Manage Categories',
            adminUser: req.session.adminUser,
            path: '/admin/categories',
            categories: [] // Pass an empty array on error
        });
    }
});

router.get('/categories/:id', isAdmin, categoryController.getCategory);
router.post('/categories/add', isAdmin, categoryController.addCategory);
router.put('/categories/:categoryId', isAdmin, categoryController.updateCategory);
router.delete('/categories/:categoryId', isAdmin, categoryController.deleteCategory);

// Order management routes
router.get('/orders', isAdmin, (req, res) => {
    res.render('admin/orders', {
        title: 'Manage Orders',
        adminUser: req.session.adminUser,
        path: '/admin/orders',
        orders: []
    });
});

router.put('/orders/:id/status', isAdmin, (req, res) => {
    // Update order status logic
});

// Route to block/unblock a user
router.put('/users/:id/block', async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.blocked = !user.blocked; // Toggle the blocked status
        await user.save();

        res.json({ message: `User has been ${user.blocked ? 'blocked' : 'unblocked'}` });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

module.exports = router; 