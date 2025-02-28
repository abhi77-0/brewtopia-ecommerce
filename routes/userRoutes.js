const express = require("express");
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

const router = express.Router();

// Auth routes
router.get("/signup", (req, res) => {
    res.render("signup"); 
});

router.post("/signup", signup);

router.get("/verify-otp", (req, res) => {
    res.render("verifyOtp"); 
});

router.post("/verify-otp", verifyOTP);

router.get("/login", loginPage);
router.post("/login", login);

// Forgot Password routes
router.get("/forgot-password", forgotPasswordPage);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

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

