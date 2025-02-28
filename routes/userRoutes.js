const express = require("express");
const passport = require('passport');
const { 
    signup, 
    verifyOTP, 
    loginPage, 
    login, 
    resendOTP,
    forgotPasswordPage,
    forgotPassword,
    resetPassword
} = require("../controllers/userController");
const { isAuthenticated } = require('../middlewares/authMiddleware');
const { 
    validateSignup, 
    validateLogin, 
    validateResetPassword,
    validateForgotPassword 
} = require('../middlewares/validationMiddleware');

const router = express.Router();

// Public routes (no authentication required)
router.get("/signup", (req, res) => {
    if (req.session.user) {
        return res.redirect('/users/home');
    }
    res.render("signup", { 
        error: req.query.error,
        user: null 
    }); 
});

router.post("/signup", validateSignup, signup);

// Google Auth routes
router.get('/auth/google',
    (req, res, next) => {
        if (req.session.user) {
            return res.redirect('/users/home');
        }
        passport.authenticate('google', { 
            scope: ['profile', 'email'],
            prompt: 'select_account'
        })(req, res, next);
    }
);

router.get('/auth/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/users/signup?error=Google authentication failed',
        failureFlash: true
    }),
    (req, res) => {
        req.session.user = {
            id: req.user._id,
            email: req.user.email,
            name: req.user.name
        };
        res.redirect('/users/home');
    }
);

router.get("/verify-otp", (req, res) => {
    if (!req.session.tempUser) {
        return res.redirect('/users/signup');
    }
    res.render("verifyOtp", { user: null }); 
});

router.post("/verify-otp", verifyOTP);

router.get("/login", (req, res) => {
    if (req.session.user) {
        return res.redirect('/users/home');
    }
    res.render("login", { 
        error: req.query.error,
        user: null 
    });
});

router.post("/login", validateLogin, login);

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/users/login');
    });
});

// Forgot Password routes
router.get("/forgot-password", (req, res) => {
    if (req.session.user) {
        return res.redirect('/users/home');
    }
    res.render("forgotPassword", { user: null });
});

router.post("/forgot-password", validateForgotPassword, forgotPassword);
router.post("/reset-password", validateResetPassword, resetPassword);

// Products page route - requires authentication
router.get('/products', isAuthenticated, (req, res) => {
    res.render('products', {
        title: 'Brewtopia - Products',
        user: req.session.user,
        error: null,
        categoryFilter: null
    });
});

// Category routes - requires authentication
router.get('/category/:type', isAuthenticated, (req, res) => {
    const categoryType = req.params.type;
    res.render('products', {
        title: `Brewtopia - ${categoryType.charAt(0).toUpperCase() + categoryType.slice(1)} Beers`,
        user: req.session.user,
        categoryFilter: categoryType,
        error: null
    });
});

// Protected home route
router.get('/home', isAuthenticated, (req, res) => {
    res.render('home', { 
        user: req.session.user,
        title: 'Welcome to Brewtopia'
    });
});

// Resend OTP route
router.post('/resend-otp', (req, res) => {
    if (!req.session.tempUser) {
        return res.status(400).json({ error: 'No pending verification found' });
    }
    resendOTP(req, res);
});

module.exports = router;

