const bcrypt = require("bcryptjs");
const { getDB } = require("../config/db");
const { generateOTP, verifyOTP } = require("../config/otpService");

async function signup(req, res) {
    const { name, email, password } = req.body;
    const db = getDB();

    try {
        // Check if the user already exists
        const existingUser = await db.collection("users").findOne({ email });
        if (existingUser) {
            // Redirect to login page if user already exists
            return res.redirect("/login"); // Adjust the path as necessary
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await generateOTP(email); // Store OTP in DB

        // Temporarily save user data for final signup step after OTP verification
        await db.collection("pending_users").insertOne({ email, name, password: hashedPassword });

        // Render OTP verification page
        res.render("verifyOtp", { email }); // Pass the email to the OTP page
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

async function verifyOTPController(req, res) {
    const { email, otp } = req.body;
    const db = getDB();

    // Verify the OTP
    if (!(await verifyOTP(email, otp))) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Find the pending user
    const pendingUser = await db.collection("pending_users").findOne({ email });
    if (!pendingUser) {
        return res.status(400).json({ message: "No pending registration found" });
    }

    // Move user from "pending_users" to "users"
    await db.collection("users").insertOne(pendingUser);
    await db.collection("pending_users").deleteOne({ email });

    // Redirect to the login page after successful signup
    res.redirect("/login"); // Redirect to the login page
}

async function loginPage(req, res) {
    res.render("login"); // Ensure this function is defined
}

async function login(req, res) {
    const { email, password } = req.body;
    const db = getDB();

    try {
        // Find the user by email
        const user = await db.collection("users").findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Compare the password (assuming you have stored hashed passwords)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Create session or token here if needed
        req.session.user = { id: user._id, email: user.email }; // Store user info in session

        // Redirect to home page after successful login
        res.redirect("/home"); // Adjust the path as necessary
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

module.exports = { signup, verifyOTP: verifyOTPController, loginPage, login };
