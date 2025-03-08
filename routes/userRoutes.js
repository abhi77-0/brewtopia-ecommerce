const express = require("express");
const passport = require('passport');
const userController = require("../controllers/userController");
const { isAuthenticated } = require('../middlewares/authMiddleware');
const { 
    validateSignup, 
    validateLogin, 
    validateResetPassword,
    validateForgotPassword 
} = require('../middlewares/validationMiddleware');

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
        failureRedirect: '/users/login',
        failureMessage: true
    }),
    userController.handleGoogleCallback
);

// Protected routes
router.get('/products', isAuthenticated, userController.renderProductsPage);
router.get('/category/:type', isAuthenticated, userController.renderCategoryPage);
router.get('/home', isAuthenticated, userController.renderHomePage);

module.exports = router;