const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const PendingUser = require("../models/pendingUserModel");
const OTP = require("../models/otpModel");
const { generateOTP, verifyOTP } = require("../config/otpService");

// Signup Handlers
exports.renderSignupPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/users/home');
    }
    res.render("users/signup", { 
        error: req.query.error,
        user: null 
    }); 
};

exports.handleSignup = async (req, res) => {
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
};

// OTP Verification Handlers
exports.renderVerifyOtpPage = (req, res) => {
    if (!req.session.tempUser) {
        return res.redirect('/users/signup');
    }
    res.render("verifyOtp", { user: null }); 
};

exports.handleVerifyOtp = async (req, res) => {
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

        res.redirect("/users/home");
    } catch (error) {
        console.error("OTP verification error:", error);
        res.render("verifyOtp", { 
            email,
            error: "An error occurred during verification"
        });
    }
};

// Login Handlers
exports.renderLoginPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/users/home');
    }
    res.render('users/login', { 
        error: req.query.error,
        user: null 
    });
};

exports.handleLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("login", { error: "Invalid email or password" });
        }

        // Check if the user is blocked
        if (user.blocked) {
            return res.render("login", { error: "Your account is blocked. Please contact support." });
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

        res.redirect("/users/home");
    } catch (error) {
        console.error("Login error:", error);
        res.render("login", { error: "An error occurred during login" });
    }
};

// Logout Handler
exports.handleLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/users/login');
    });
};

// Forgot Password Handlers
exports.renderForgotPasswordPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/users/home');
    }
    res.render("forgotPassword", { user: null });
};

exports.handleForgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.render("forgotPassword", { 
                error: "No account found with this email address." 
            });
        }

        // Delete any existing OTP
        await OTP.deleteOne({ email });
        
        // Generate new OTP
        await generateOTP(email);
        
        // Store email in session for password reset flow
        req.session.resetEmail = email;

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
};

exports.handleResetPassword = async (req, res) => {
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
};

// Resend OTP Handler
exports.handleResendOtp = async (req, res) => {
    const { email } = req.body;
    const MAX_RESEND_ATTEMPTS = 3;

    try {
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: "Email is required" 
            });
        }

        // Check both PendingUser and User collections
        const pendingUser = await PendingUser.findOne({ email });
        const existingUser = await User.findOne({ email });

        // If no pending user and no existing user, return error
        if (!pendingUser && !existingUser) {
            return res.status(400).json({ 
                success: false,
                message: "No pending registration or user found" 
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

        // Delete any existing OTP for this email
        await OTP.deleteOne({ email });

        try {
            // Generate new OTP
            await generateOTP(email);

            // Update or create OTP document with resend count
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
};

// Additional Page Rendering Handlers
exports.renderProductsPage = (req, res) => {
    res.render('users/products', {
        title: 'Brewtopia - Products',
        error: null,
        categoryFilter: null
    });
};

exports.renderCategoryPage = (req, res) => {
    const categoryType = req.params.type;
    res.render('users/products', {
        title: `Brewtopia - ${categoryType.charAt(0).toUpperCase() + categoryType.slice(1)} Beers`,
        categoryFilter: categoryType,
        error: null
    });
};

exports.renderHomePage = (req, res) => {
    res.render('users/home', { 
        title: 'Welcome to Brewtopia'
    });
};

// Function to get all users
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find(); // Fetch all users
        res.render('admin/users', { users, title: 'Manage Users' }); // Render the user management page
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Error fetching users');
    }
};

// Function to block/unblock a user
exports.blockUser = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Toggle the blocked status
        user.blocked = !user.blocked;
        await user.save();

        res.status(200).json({ message: `User has been ${user.blocked ? 'blocked' : 'unblocked'}.` });
    } catch (error) {
        console.error('Error blocking user:', error);
        res.status(500).json({ error: 'Failed to block/unblock user' });
    }
};

// Google Auth callback handler
exports.handleGoogleCallback = (req, res) => {
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
};

// Add this to your userController.js file if it's not already there
exports.getProfile = async (req, res) => {
    try {
        // Log for debugging
        console.log('Session in getProfile:', req.session);
        console.log('User in getProfile:', req.user);

        // Check both session user and passport user
        const userData = req.session.user || req.user;
        
        if (!userData) {
            return res.redirect('/users/login');
        }

        // Find user in database
        const user = await User.findOne({
            $or: [
                { _id: userData.id },
                { email: userData.email }
            ]
        });

        if (!user) {
            return res.redirect('/users/login');
        }

        res.render('users/profile', {
            title: 'My Profile',
            user: user,
            isAuthenticated: true
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.redirect('/users/login');
    }
};