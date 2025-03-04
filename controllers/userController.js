const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const PendingUser = require("../models/pendingUserModel");
const OTP = require("../models/otpModel");
const { generateOTP, verifyOTP } = require("../config/otpService");

async function signup(req, res) {
    const { name, email, password } = req.body;

    try {
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render("signup", { 
                error: "User already exists. Please login instead."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await generateOTP(email);

        // Save pending user
        await PendingUser.create({ 
            email, 
            name, 
            password: hashedPassword 
        });

        res.render("verifyOtp", { email });
    } catch (error) {
        console.error("Signup error:", error);
        res.render("signup", { 
            error: "Error during signup. Please try again." 
        });
    }
}

async function verifyOTPController(req, res) {
    const { email, otp } = req.body;
    const isPasswordReset = req.session.resetEmail === email;

    try {
        const otpDoc = await OTP.findOne({ email });
        
        if (!otpDoc) {
            return res.render("verifyOtp", { 
                email,
                error: "No OTP found. Please request a new one."
            });
        }

        // Check OTP expiration
        if (otpDoc.isExpired()) {
            await OTP.deleteOne({ email });
            return res.render("verifyOtp", { 
                email,
                error: "OTP has expired. Please request a new one."
            });
        }

        if (!(await verifyOTP(email, otp))) {
            return res.render("verifyOtp", { 
                email,
                error: "Invalid OTP. Please try again."
            });
        }

        await OTP.deleteOne({ email });

        if (isPasswordReset) {
            return res.render("resetPassword", { email });
        }

        const pendingUser = await PendingUser.findOne({ email });
        if (!pendingUser) {
            return res.render("verifyOtp", { 
                email,
                error: "No pending registration found"
            });
        }

        // Create verified user
        const newUser = await User.create({
            email: pendingUser.email,
            name: pendingUser.name,
            password: pendingUser.password
        });

        await PendingUser.deleteOne({ email });

        req.session.user = {
            id: newUser._id,
            email: newUser.email,
            name: newUser.name
        };

        res.redirect("/");
    } catch (error) {
        console.error("OTP verification error:", error);
        res.render("verifyOtp", { 
            email,
            error: "An error occurred during verification"
        });
    }
}

function getLoginPage(req, res) {
    res.render("login", { 
        error: null, 
        success: null 
    });
}

function getSignupPage(req, res) {
    res.render("signup", { 
        error: null 
    });
}

async function login(req, res) {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("login", { error: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render("login", { error: "Invalid email or password" });
        }

        req.session.user = { 
            id: user._id, 
            email: user.email,
            name: user.name 
        };

        res.redirect("/");
    } catch (error) {
        console.error("Login error:", error);
        res.render("login", { error: "An error occurred during login" });
    }
}

function logout(req, res) {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
        }
        res.redirect("/users/login");
    });
}

async function getProfile(req, res) {
    try {
        const user = await User.findById(req.session.user.id).select('-password');
        if (!user) {
            return res.redirect("/users/login");
        }

        res.render("profile", { user });
    } catch (error) {
        console.error("Get profile error:", error);
        res.redirect("/users/login");
    }
}

async function updateProfile(req, res) {
    const { name, email } = req.body;

    try {
        const user = await User.findByIdAndUpdate(
            req.session.user.id,
            { $set: { name, email } },
            { new: true }
        );

        req.session.user = {
            ...req.session.user,
            name: user.name,
            email: user.email
        };

        res.json({ success: true });
    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: "Failed to update profile" });
    }
}

async function changePassword(req, res) {
    const { currentPassword, newPassword } = req.body;

    try {
        const user = await User.findById(req.session.user.id);
        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({ error: "Failed to change password" });
    }
}

function forgotPasswordPage(req, res) {
    res.render("forgotPassword", { error: null });
}

async function forgotPassword(req, res) {
    const { email } = req.body;

    try {
        console.log('Searching for user with email:', email);
        const user = await User.findOne({ email });
        
        if (!user) {
            console.log('No user found with email:', email);
            return res.render("forgotPassword", { 
                error: "No account found with this email address." 
            });
        }

        console.log('User found, generating OTP');
        // Delete any existing OTP
        await OTP.deleteOne({ email });
        
        // Generate new OTP
        await generateOTP(email);
        
        // Store email in session for password reset flow
        req.session.resetEmail = email;

        console.log('Rendering verifyOtp page');
        res.render("verifyOtp", { 
            email,
            resetPassword: true,
            error: null
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

    try {
        if (password !== confirmPassword) {
            return res.render("resetPassword", {
                email,
                error: "Passwords do not match"
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.render("resetPassword", {
                email,
                error: "User not found"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        delete req.session.resetEmail;

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

async function resendOTP(req, res) {
    const { email } = req.body;
    const MAX_RESEND_ATTEMPTS = 3;

    try {
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: "Email is required" 
            });
        }

        const pendingUser = await PendingUser.findOne({ email });
        if (!pendingUser) {
            return res.status(400).json({ 
                success: false,
                message: "No pending registration found" 
            });
        }

        const otpDoc = await OTP.findOne({ email });
        const resendCount = otpDoc?.resendCount || 0;

        if (resendCount >= MAX_RESEND_ATTEMPTS) {
            return res.status(400).json({ 
                success: false,
                message: "Maximum OTP resend attempts reached. Please start registration again.",
                maxAttemptsReached: true
            });
        }

        await OTP.deleteOne({ email });

        try {
            await generateOTP(email);
            await OTP.updateOne(
                { email },
                { $set: { resendCount: resendCount + 1 } },
                { upsert: true }
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

module.exports = {
    signup,
    login,
    logout,
    getLoginPage,
    getSignupPage,
    getProfile,
    updateProfile,
    changePassword,
    verifyOTP: verifyOTPController,
    resendOTP,
    forgotPasswordPage,
    forgotPassword,
    resetPassword
};
