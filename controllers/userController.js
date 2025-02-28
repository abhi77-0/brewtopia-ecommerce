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
            return res.render("signup", { 
                error: "User already exists. Please login instead."
            });
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
    const isPasswordReset = req.session.resetEmail === email;

    try {
        // Get the OTP document from the database
        const otpDoc = await db.collection("otps").findOne({ email });
        
        if (!otpDoc) {
            return res.render("verifyOtp", { 
                email,
                error: "No OTP found. Please request a new one."
            });
        }

        // Check if OTP has expired (1 minute = 60000 milliseconds)
        const now = new Date();
        const otpCreatedTime = new Date(otpDoc.createdAt);
        const timeDiff = now - otpCreatedTime;
        
        if (timeDiff > 60000) {
            // Delete expired OTP
            await db.collection("otps").deleteOne({ email });
            return res.render("verifyOtp", { 
                email,
                error: "OTP has expired. Please request a new one."
            });
        }

        // Verify the OTP
        if (!(await verifyOTP(email, otp))) {
            return res.render("verifyOtp", { 
                email,
                error: "Invalid OTP. Please try again."
            });
        }

        // Clean up used OTP
        await db.collection("otps").deleteOne({ email });

        if (isPasswordReset) {
            // If this is a password reset flow, redirect to reset password page
            return res.render("resetPassword", { email });
        } else {
            // Regular signup flow
            const pendingUser = await db.collection("pending_users").findOne({ email });
            if (!pendingUser) {
                return res.render("verifyOtp", { 
                    email,
                    error: "No pending registration found"
                });
            }

            // Move user from "pending_users" to "users"
            const newUser = await db.collection("users").insertOne(pendingUser);
            await db.collection("pending_users").deleteOne({ email });

            // Create session for the new user
            req.session.user = {
                id: newUser.insertedId,
                email: pendingUser.email,
                name: pendingUser.name
            };

            // Redirect to home page after successful verification
            res.redirect("/users/home");
        }
    } catch (error) {
        console.error("OTP verification error:", error);
        res.render("verifyOtp", { 
            email,
            error: "An error occurred during verification"
        });
    }
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
            return res.render("login", { error: "Invalid email or password" });
        }

        // Compare the password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render("login", { error: "Invalid email or password" });
        }

        // Create session for the user
        req.session.user = { 
            id: user._id, 
            email: user.email,
            name: user.name 
        };

        // Redirect to home page after successful login
        res.redirect("/users/home");
    } catch (error) {
        console.error("Login error:", error);
        res.render("login", { error: "An error occurred during login" });
    }
}

async function resendOTP(req, res) {
    const { email } = req.body;
    const db = getDB();
    const MAX_RESEND_ATTEMPTS = 3;

    try {
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: "Email is required" 
            });
        }

        // Check if there's a pending registration
        const pendingUser = await db.collection("pending_users").findOne({ email });
        if (!pendingUser) {
            return res.status(400).json({ 
                success: false,
                message: "No pending registration found" 
            });
        }

        // Check resend attempts
        const otpDoc = await db.collection("otps").findOne({ email });
        const resendCount = otpDoc?.resendCount || 0;

        if (resendCount >= MAX_RESEND_ATTEMPTS) {
            return res.status(400).json({ 
                success: false,
                message: "Maximum OTP resend attempts reached. Please start registration again.",
                maxAttemptsReached: true
            });
        }

        // Delete existing OTP
        await db.collection("otps").deleteOne({ email });

        // Generate and store new OTP with incremented resend count
        try {
            await generateOTP(email);
            // Update the resend count
            await db.collection("otps").updateOne(
                { email },
                { $set: { resendCount: resendCount + 1 } }
            );
            
            const remainingAttempts = MAX_RESEND_ATTEMPTS - (resendCount + 1);
            return res.json({ 
                success: true,
                message: `New OTP sent successfully. ${remainingAttempts} resend attempts remaining.`,
                remainingAttempts
            });
        } catch (otpError) {
            console.error("OTP Generation error:", otpError);
            return res.status(500).json({ 
                success: false,
                message: "Failed to generate new OTP" 
            });
        }
    } catch (error) {
        console.error("Resend OTP error:", error);
        return res.status(500).json({ 
            success: false,
            message: "Failed to resend OTP. Please try again." 
        });
    }
}

async function forgotPasswordPage(req, res) {
    res.render('forgotPassword');
}

async function forgotPassword(req, res) {
    const { email } = req.body;
    const db = getDB();

    try {
        // Check if user exists
        const user = await db.collection("users").findOne({ email });
        if (!user) {
            return res.render("forgotPassword", { 
                error: "No account found with this email address." 
            });
        }

        // Delete any existing OTP for this email
        await db.collection("otps").deleteOne({ email });

        // Generate and send new OTP
        await generateOTP(email);

        // Store the email in session for verification
        req.session.resetEmail = email;

        // Redirect to OTP verification page
        res.render("verifyOtp", { 
            email,
            resetPassword: true,
            success: "OTP has been sent to your email address."
        });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.render("forgotPassword", { 
            error: "An error occurred. Please try again." 
        });
    }
}

async function resetPassword(req, res) {
    const { email, password, confirmPassword } = req.body;
    const db = getDB();

    try {
        // Validate passwords match
        if (password !== confirmPassword) {
            return res.render("resetPassword", {
                email,
                error: "Passwords do not match"
            });
        }

        // Find the user
        const user = await db.collection("users").findOne({ email });
        if (!user) {
            return res.render("resetPassword", {
                email,
                error: "User not found"
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update the user's password
        await db.collection("users").updateOne(
            { email },
            { $set: { password: hashedPassword } }
        );

        // Clear the reset email from session
        delete req.session.resetEmail;

        // Redirect to login with success message
        res.render("login", {
            success: "Password has been reset successfully. Please login with your new password."
        });

    } catch (error) {
        console.error("Password reset error:", error);
        res.render("resetPassword", {
            email,
            error: "An error occurred while resetting your password"
        });
    }
}

module.exports = { 
    signup, 
    verifyOTP: verifyOTPController, 
    loginPage, 
    login,
    resendOTP,
    forgotPasswordPage,
    forgotPassword,
    resetPassword
};
