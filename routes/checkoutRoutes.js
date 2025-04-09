const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/user/checkoutController');

// Import the middleware object and destructure to get the isAuthenticated function
const authMiddleware = require('../middlewares/authMiddleware');
const { isAuthenticated } = authMiddleware;

// Checkout page
router.get('/checkout', isAuthenticated, checkoutController.getCheckout);

// Process checkout 
router.post('/process', isAuthenticated, checkoutController.processCheckout);

// Order confirmation
router.get('/confirmation/:orderId', isAuthenticated, checkoutController.orderConfirmation);

// Add these routes for Razorpay
router.post('/razorpay/create-order', isAuthenticated, checkoutController.createRazorpayOrder);
router.post('/razorpay/verify', isAuthenticated, checkoutController.verifyPayment);
router.post('/razorpay/create-failed-order', isAuthenticated, checkoutController.createFailedOrder);
router.get('/razorpay/success/:orderId', isAuthenticated, checkoutController.paymentSuccess);
router.get('/razorpay/failure/:orderId', isAuthenticated, checkoutController.paymentFailure);
router.get('/razorpay/retry/:orderId', isAuthenticated, checkoutController.retryPayment);

// Add these routes
router.post('/apply-coupon', isAuthenticated, checkoutController.applyCoupon);
router.post('/remove-coupon', isAuthenticated, checkoutController.removeCoupon);

// Coupon routes
router.get('/available-coupons', isAuthenticated, checkoutController.availableCoupons);

module.exports = router;