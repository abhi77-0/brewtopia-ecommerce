const express = require("express");
const { signup, verifyOTP, loginPage, login } = require("../controllers/userController");

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

// Render Login Page
router.get("/login", loginPage); // Render login page
router.post("/login", login); // Handle login logic

// Render Home Page
router.get("/home", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login"); // Redirect to login if not authenticated
    }
    res.render("home"); // Render the home page
});

module.exports = router;

