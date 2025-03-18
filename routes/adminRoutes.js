// adminRoutes.js
const express = require('express');
const router = express.Router();

// Import controllers
const adminController = require('../controllers/admin/adminController');
const categoryController = require('../controllers/user/categoryController');
const productController = require('../controllers/user/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');

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
router.get('/products', isAdmin, adminController.getAdminProducts);
router.get('/products/:productId', isAdmin, adminController.getAdminProductDetail);
router.post('/products/add', isAdmin, productImageUpload, adminController.addProduct);
router.put('/products/:productId', isAdmin, productImageUpload, adminController.editProduct);
router.delete('/products/:productId', isAdmin, adminController.deleteProduct);
router.put('/products/:id/visibility', isAdmin, adminController.toggleProductVisibility);

// Toggle product visibility
router.post('/products/toggle-visibility/:id', isAdmin, adminController.toggleProductVisibility);

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
router.get('/orders', isAdmin, orderController.getAllOrders);
//router.put('/orders/:id/status', isAdmin, orderController.updateOrderStatus);
router.put('/orders/:id/status', isAdmin, orderController.updateOrderStatus);

// Add debugging middleware
router.use('/orders/:orderId/return', (req, res, next) => {
    console.log('Return route accessed:', {
        method: req.method,
        params: req.params,
        body: req.body,
        url: req.originalUrl
    });
    next();
});

router.put('/orders/:orderId/return', isAdmin, (req, res, next) => {
    console.log('Before isAdmin middleware:', {
        user: req.user,
        session: req.session
    });
    next();
}, orderController.handleReturn);

// Coupon Management Routes
router.get('/coupons', isAdmin, couponController.getCoupons);
router.post('/coupons', isAdmin, couponController.createCoupon);
router.patch('/coupons/:id/toggle', isAdmin, couponController.toggleCouponStatus);

module.exports = router;