// adminRoutes.js
const express = require('express');
const router = express.Router();

// Import controllers
const adminController = require('../controllers/admin/adminController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/user/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const offerController = require('../controllers/admin/offerController');
const salesReportController = require('../controllers/admin/salesReportController');

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
router.get('/categories', isAdmin, categoryController.getCategories);
router.get('/categories/:id', isAdmin, categoryController.getCategory);
router.post('/categories/add', isAdmin, categoryController.addCategory);
router.put('/categories/:categoryId', isAdmin, categoryController.updateCategory);
router.patch('/categories/:id/toggle-visibility', isAdmin, categoryController.toggleVisibility);

// Order Management Routes
router.get('/orders', isAdmin, orderController.getAllOrders);
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
router.delete('/coupons/:id', isAdmin,couponController.deleteCoupon);

// Offer Management Routes (New)
router.get('/offers', isAdmin, offerController.getOffers);
router.get('/offers/:id', isAdmin, offerController.getOffer);
router.post('/offers/add', isAdmin, offerController.postAddOffer);
router.put('/offers/edit/:id', isAdmin, offerController.postEditOffer);
router.delete('/offers/delete/:id', isAdmin, offerController.deleteOffer);


// Sales report page
router.get('/', isAdmin, salesReportController.getSalesReportPage);

// Generate sales report
router.post('/generate', isAdmin, salesReportController.generateSalesReport);

// Download reports
router.get('/download/pdf', isAdmin, salesReportController.downloadPDF);
router.get('/download/excel', isAdmin, salesReportController.downloadExcel);

module.exports = router;

module.exports = router;