// adminRoutes.js
const express = require('express');
const router = express.Router();

// Import controllers
const adminController = require('../controllers/adminController');
const categoryController = require('../controllers/categoryController');
const productController = require('../controllers/productController');

// Import middleware and configurations
const { isAdmin } = require('../middlewares/adminAuth');
const { productImageUpload } = require('../config/multer');

// Admin Authentication Routes
router.get('/login', adminController.getLoginPage);
router.post('/login', adminController.adminLogin);
router.get('/logout', adminController.adminLogout);

// Admin Dashboard Route
router.get('/dashboard', isAdmin, adminController.getDashboard);

// Product Management Routes
router.get('/products', isAdmin, productController.getAllProducts);
router.get('/products/:productId', isAdmin, productController.getProduct);
router.post('/products/add', isAdmin, productImageUpload, productController.addProduct);
router.put('/products/:productId', isAdmin, productImageUpload, productController.editProduct);
router.delete('/products/:productId', isAdmin, productController.deleteProduct);
router.put('/products/:productId/hide', isAdmin, adminController.toggleProductVisibility);

// User Management Routes
router.get('/users', isAdmin, adminController.getUsers);
router.put('/users/:id/block', isAdmin, adminController.toggleUserBlockStatus);

// Category Management Routes
router.get('/categories', isAdmin, adminController.getCategories);
router.get('/categories/:id', isAdmin, categoryController.getCategory);
router.post('/categories/add', isAdmin, categoryController.addCategory);
router.put('/categories/:categoryId', isAdmin, categoryController.updateCategory);
router.delete('/categories/:categoryId', isAdmin, categoryController.deleteCategory);

// Order Management Routes
router.get('/orders', isAdmin, adminController.getOrders);
router.put('/orders/:id/status', isAdmin, adminController.updateOrderStatus);

module.exports = router;