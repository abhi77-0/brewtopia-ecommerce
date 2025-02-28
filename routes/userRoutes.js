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

// Auth routes
router.get("/signup", (req, res) => {
    res.render("signup", { error: req.query.error }); 
});

router.post("/signup", validateSignup, signup);

// Google Auth routes
router.get('/auth/google',
    (req, res, next) => {
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
        // Create session
        req.session.user = {
            id: req.user._id,
            email: req.user.email,
            name: req.user.name
        };
        res.redirect('/users/home');
    }
);

// Existing routes...
router.get("/verify-otp", (req, res) => {
    res.render("verifyOtp"); 
});

router.post("/verify-otp", verifyOTP);

router.get("/login", loginPage);
router.post("/login", validateLogin, login);

// Forgot Password routes
router.get("/forgot-password", forgotPasswordPage);
router.post("/forgot-password", validateForgotPassword, forgotPassword);
router.post("/reset-password", validateResetPassword, resetPassword);

// Protected routes
router.get('/home', isAuthenticated, (req, res) => {
    res.render('home', { 
        user: req.session.user,
        title: 'Welcome to Brewtopia'
    });
});

// Resend OTP route
router.post('/resend-otp', resendOTP);

module.exports = router;

