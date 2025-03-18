const express = require('express');
const router = express.Router();
const checkoutController = require('../../controllers/user/checkoutController');
const { isAuthenticated } = require('../../middleware/auth');

// Checkout routes
router.get('/', isAuthenticated, checkoutController.getCheckout);
router.post('/process', isAuthenticated, checkoutController.processCheckout);
router.get('/confirmation/:orderId', isAuthenticated, checkoutController.orderConfirmation);

// Razorpay payment routes
router.post('/razorpay/create-order', isAuthenticated, checkoutController.createRazorpayOrder);
router.post('/razorpay/verify', isAuthenticated, checkoutController.verifyPayment);
router.get('/razorpay/success/:orderId', isAuthenticated, checkoutController.paymentSuccess);
router.get('/razorpay/failure/:orderId', isAuthenticated, checkoutController.paymentFailure);
router.post('/razorpay/retry/:orderId', isAuthenticated, checkoutController.retryPayment);

module.exports = router;