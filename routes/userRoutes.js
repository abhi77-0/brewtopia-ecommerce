const express = require("express");
const { signup, verifyOTP, loginPage, login } = require("../controllers/userController");
const { isAuthenticated } = require('../middlewares/authMiddleware');

const router = express.Router();

// Render Signup Page
router.get("/signup", (req, res) => {
    res.render("signup"); 
});

// Handle Signup Form Submission
router.post("/signup", (req, res) => {
    console.log("Signup form submitted");
    signup(req, res);
});

// Render OTP Verification Page
router.get("/verify-otp", (req, res) => {
    res.render("verifyOtp"); 
});

// Handle OTP Verification Form
router.post("/verify-otp", verifyOTP);

router.get("/login", loginPage); // Render login page
router.post("/login", login); // Handle login logic

// Protected routes
router.get('/home', isAuthenticated, (req, res) => {
    res.render('home', { user: req.session.user });
});

module.exports = router;

