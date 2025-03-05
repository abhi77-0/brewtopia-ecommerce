const express = require("express");
const passport = require('passport');
const { 
    renderSignupPage,
    handleSignup, 
    renderVerifyOtpPage,
    handleVerifyOtp, 
    renderLoginPage, 
    handleLogin,
    handleLogout,
    renderForgotPasswordPage,
    handleForgotPassword,
    handleResetPassword,
    handleResendOtp,
    renderProductsPage,
    renderCategoryPage,
    renderHomePage
} = require("../controllers/userController");
const { isAuthenticated } = require('../middlewares/authMiddleware');
const { 
    validateSignup, 
    validateLogin, 
    validateResetPassword,
    validateForgotPassword 
} = require('../middlewares/validationMiddleware');

const router = express.Router();

// Public routes
router.get("/signup", renderSignupPage);
router.post("/signup", validateSignup, handleSignup);

router.get("/verify-otp", renderVerifyOtpPage);
router.post("/verify-otp", handleVerifyOtp);

router.get("/login", renderLoginPage);
router.post("/login", validateLogin, handleLogin);

router.get('/logout', handleLogout);

// Forgot Password routes
router.get("/forgot-password", renderForgotPasswordPage);
router.post("/forgot-password", validateForgotPassword, handleForgotPassword);
router.post("/reset-password", validateResetPassword, handleResetPassword);

// Resend OTP route
router.post('/resend-otp', handleResendOtp);

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
    function(req, res) {
        // Store user data in session
        req.session.user = {
            id: req.user.id,
            name: req.user.displayName,
            email: req.user.emails[0].value,
            picture: req.user.photos[0].value,
            isAuthenticated: true
        };
        // Successful authentication, redirect home
        res.redirect('/users/home');
    }
);

// Protected routes
router.get('/products', isAuthenticated, renderProductsPage);
router.get('/category/:type', isAuthenticated, renderCategoryPage);
router.get('/home', isAuthenticated, renderHomePage);

module.exports = router;