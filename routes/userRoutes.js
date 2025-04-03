const express = require("express");
const passport = require('passport');
const userController = require("../controllers/user/userController");
const { isAuthenticated } = require('../middlewares/authMiddleware');
const { 
    validateSignup, 
    validateLogin, 
    validateResetPassword,
    validateForgotPassword 
} = require('../middlewares/validationMiddleware');
const checkoutController = require("../controllers/user/checkoutController");
const shopController = require('../controllers/user/shopController');

const router = express.Router();

// Public routes
router.get("/signup", userController.renderSignupPage);
router.post("/signup", validateSignup, userController.handleSignup);

router.get("/verify-otp", userController.renderVerifyOtpPage);
router.post("/verify-otp", userController.handleVerifyOtp);

router.get("/login", userController.renderLoginPage);
router.post("/login", validateLogin, userController.handleLogin);

router.get('/logout', userController.handleLogout);

// Forgot Password routes
router.get("/forgot-password", userController.renderForgotPasswordPage);
router.post("/forgot-password", validateForgotPassword, userController.handleForgotPassword);
router.post("/reset-password", validateResetPassword, userController.handleResetPassword);

// Resend OTP route
router.post('/resend-otp', userController.handleResendOtp);

// Google Auth routes
router.get('/auth/google',
    passport.authenticate('google', { 
        scope: ['profile', 'email']
    })
);

router.get('/auth/google/callback',
    passport.authenticate('google', { 
        failureRedirect: '/users/signup?error=Authentication+failed',
        session: true
    }),
    userController.handleGoogleAuthCallback
);

// Protected routes
router.get('/products', isAuthenticated, userController.renderProductsPage);
router.get('/category/:type', isAuthenticated, userController.renderCategoryPage);
router.get('/home', isAuthenticated, shopController.getFeaturedProducts, userController.renderHomePage);
//profile
router.get('/profile', isAuthenticated, userController.getProfile);
router.get('/profile/edit', isAuthenticated, userController.getEditProfile);
router.post('/profile/update', isAuthenticated, userController.updateProfile);


router.post('/profile/verify-email-otp', isAuthenticated, userController.handleVerifyOtp);

// Address routes
router.get('/addresses', isAuthenticated, userController.getAddresses);
router.post('/address', isAuthenticated, userController.addAddress);
router.get('/address/:id', isAuthenticated, userController.getAddress);
router.put('/address/:id', isAuthenticated, userController.updateAddress);
router.delete('/address/:id', isAuthenticated, userController.deleteAddress);

// Reset password routes
router.get("/reset-password", userController.renderResetPasswordPage);
router.post("/reset-password", validateResetPassword, userController.handleResetPassword);

// Add this route to your user routes
router.post('/profile/change-password', isAuthenticated, userController.changePassword);

// Coupon routes
router.get('/coupons', isAuthenticated, checkoutController.showAvailableCoupons);

// Email change verification route
router.get('/verify-email-change', isAuthenticated, userController.renderEmailChangeVerification);

module.exports = router;