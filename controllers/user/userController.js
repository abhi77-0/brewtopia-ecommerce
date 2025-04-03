const bcrypt = require("bcryptjs");
const User = require("../../models/userModel");
const PendingUser = require("../../models/pendingUserModel");
const OTP = require("../../models/otpModel");
const { generateOTP, verifyOTP } = require("../../config/otpService");
const Address = require("../../models/Address");

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

        res.render("users/verifyOtp", { email });
    } catch (error) {
        console.error("Signup error:", error);
        res.render("users/signup", { 
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
    const { email, otp, isEmailUpdate } = req.body;

    try {
        console.log('Verifying OTP for:', email, 'isEmailUpdate:', isEmailUpdate); // Debug log

        const otpDoc = await OTP.findOne({ email });
        
        if (!otpDoc) {
            return res.status(400).json({ 
                success: false,
                message: "No OTP found. Please request a new one."
            });
        }

        // Check OTP expiration
        if (otpDoc.isExpired()) {
            await OTP.deleteOne({ email });
            return res.status(400).json({ 
                success: false,
                message: "OTP has expired. Please request a new one."
            });
        }

        // Verify OTP
        const isValid = await verifyOTP(email, otp);
        
        if (!isValid) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid OTP. Please try again."
            });
        }

        // Handle email update verification
        if (isEmailUpdate === true || isEmailUpdate === 'true') {
            if (!req.session.pendingProfileUpdate) {
                return res.status(400).json({ 
                    success: false,
                    message: "No pending profile update found."
                });
            }

            const { name, phone, originalEmail } = req.session.pendingProfileUpdate;
            
            // Find user by original email
            const user = await User.findOne({ email: originalEmail });
            if (!user) {
                return res.status(404).json({ 
                    success: false,
                    message: "User not found."
                });
            }
            
            // Update user profile
            user.name = name;
            user.email = email;
            user.phone = phone;
            await user.save();
            
            // Update session data
            req.session.user.name = name;
            req.session.user.email = email;
            
            // Clear pending update
            delete req.session.pendingProfileUpdate;
            
            return res.json({ 
                success: true,
                message: "Email verified and profile updated successfully.",
                redirectUrl: '/users/profile'
            });
        }
        
        // Handle regular signup verification (existing logic)
        const pendingUser = await PendingUser.findOne({ email });
        
        if (!pendingUser) {
            return res.status(400).json({ 
                success: false,
                message: "No pending registration found."
            });
        }

        // Create new user from pending user data
        const newUser = new User({
            name: pendingUser.name,
            email: pendingUser.email,
            password: pendingUser.password
        });

        await newUser.save();
        await PendingUser.deleteOne({ email });
        await OTP.deleteOne({ email });

        // Set session
        req.session.user = {
            id: newUser._id,
            name: newUser.name,
            email: newUser.email
        };

        return res.json({ 
            success: true,
            message: "Account verified successfully!",
            redirectUrl: '/users/home'
        });
    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({ 
            success: false,
            message: "Error verifying OTP. Please try again."
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
            return res.render("users/login", { error: "Invalid email or password" });
        }

        // Check if the user is blocked
        if (user.blocked) {
            return res.render("users/login", { error: "Your account is blocked. Please contact support." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render("users/login", { error: "Invalid email or password" });
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
    res.render("users/forgotPassword", { user: null });
};

exports.handleForgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.render("users/forgotPassword", { 
                error: "No account found with this email address.",
                user: null
            });
        }

        // Delete any existing OTP
        await OTP.deleteOne({ email });
        
        // Generate new OTP
        await generateOTP(email);
        
        // Store email in session for password reset flow
        req.session.resetEmail = email;

        res.render("users/verifyOtp", { 
            email,
            isEmailUpdate: false,
            resetPassword: true,
            error: null,
            user: null
        });
    } catch (error) {
        console.error("Forgot password error:", error);
        res.render("users/forgot-password", { 
            error: "An error occurred. Please try again.",
            user: null
        });
    }
};

exports.handleResetPassword = async (req, res) => {
    const { email, password, confirmPassword } = req.body;

    try {
        if (password !== confirmPassword) {
            return res.render('users/reset-password', {
                email,
                error: 'Passwords do not match',
                user: null
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.render('users/reset-password', {
                email,
                error: 'User not found',
                user: null
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        // Clear the reset email from session
        delete req.session.resetEmail;

        req.flash('success', 'Password reset successful. Please login with your new password.');
        res.redirect('/users/login');

    } catch (error) {
        console.error('Password reset error:', error);
        res.render('users/reset-password', {
            email,
            error: 'Error resetting password. Please try again.',
            user: null
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

        // Find existing OTP document
        const otpDoc = await OTP.findOne({ email });
        
        // Get current resend count (0 if no document exists)
        let resendCount = 0;
        if (otpDoc && otpDoc.resendCount !== undefined) {
            resendCount = otpDoc.resendCount;
        }

        // Check if max attempts reached
        if (resendCount >= MAX_RESEND_ATTEMPTS) {
            return res.status(400).json({ 
                success: false,
                message: "Maximum OTP resend attempts reached. Please start registration again.",
                maxAttemptsReached: true,
                resendCount: MAX_RESEND_ATTEMPTS
            });
        }

        // Delete any existing OTP for this email
        if (otpDoc) {
            await OTP.deleteOne({ email });
        }

        try {
            // Generate new OTP
            await generateOTP(email);
            
            // Increment resend count
            const newResendCount = resendCount + 1;
            
            // Update OTP document with new resend count
            await OTP.findOneAndUpdate(
                { email },
                { $set: { resendCount: newResendCount } },
                { upsert: true, new: true }
            );
            
            // Calculate remaining attempts (MAX_RESEND_ATTEMPTS - current count)
            const remainingAttempts = MAX_RESEND_ATTEMPTS - newResendCount;
            
            // Determine if this was the last attempt
            const isLastAttempt = newResendCount === MAX_RESEND_ATTEMPTS;
            
            let message;
            if (isLastAttempt) {
                message = "New OTP sent successfully. This was your last resend attempt.";
            } else {
                message = `New OTP sent successfully. ${remainingAttempts} resend ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining.`;
            }
            
            return res.json({ 
                success: true,
                message: message,
                remainingAttempts: remainingAttempts,
                resendCount: newResendCount,
                isLastAttempt: isLastAttempt
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
    res.render("users/home", { 
        user: req.session.user,
        featuredProducts: res.locals.featuredProducts || [],
        title: "Home"
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

        // Check authentication status
        if (!req.isAuthenticated() && !req.session.user) {
            return res.redirect('/users/login');
        }

        // Determine user identifier based on auth type
        let userIdentifier;
        
        if (req.user) {
            // Passport auth (likely Google)
            userIdentifier = { 
                id: req.user.id || req.user._id,
                email: req.user.email
            };
        } else if (req.session.user) {
            // Local session auth
            userIdentifier = {
                id: req.session.user.id || req.session.user._id,
                email: req.session.user.email
            };
        }

        // Find user in database with more robust query
        const user = await User.findOne({
            $or: [
                { _id: userIdentifier.id },
                { email: userIdentifier.email }
            ]
        });

        if (!user) {
            console.log('User not found in database:', userIdentifier);
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
// Get edit profile page
exports.getEditProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/auth/login');
        }

        res.render('users/edit-profile', {
            title: 'Edit Profile',
            user: user
        });
    } catch (error) {
        console.error('Error loading edit profile:', error);
        req.flash('error', 'Error loading profile');
        res.redirect('/users/profile');
    }
};

// Update profile
exports.updateProfile = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const userId = req.session.user._id || req.session.user.id;
        
        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Check if email is being changed
        const isEmailChanged = email !== user.email;
        
        // If email is changed, we need to verify it first
        if (isEmailChanged) {
            // Check if email already exists for another user
            const existingUser = await User.findOne({ email, _id: { $ne: userId } });
            if (existingUser) {
                return res.json({
                    success: false,
                    message: 'Email already in use by another account'
                });
            }
            
            // Store the update data in session for later use after verification
            req.session.pendingProfileUpdate = {
                name,
                email,
                phone,
                originalEmail: user.email
            };
            
            // Generate and send OTP
            await generateOTP(email);
            
            // Return response indicating verification needed
            return res.json({
                success: true,
                requireVerification: true,
                message: 'Email verification required',
                redirectUrl: `/users/verify-email-change?email=${encodeURIComponent(email)}`
            });
        }
        
        // If email is not changed, update profile directly
        user.name = name;
        user.phone = phone;
        await user.save();
        
        // Update session data
        req.session.user.name = name;
        
        return res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
};

// Render email change verification page
exports.renderEmailChangeVerification = (req, res) => {
    const { email } = req.query;
    
    if (!email || !req.session.pendingProfileUpdate) {
        return res.redirect('/users/profile');
    }
    
    // Render the existing verifyOtp.ejs template with isEmailUpdate flag
    res.render("users/verifyOtp", { 
        email,
        isEmailUpdate: true,
        user: req.session.user
    });
};

exports.getAddresses = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const user = await User.findById(userId).populate('addresses');
        
        res.render('users/addresses', {
            title: 'My Addresses',
            user: req.session.user,
            addresses: user.addresses || []
        });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        req.flash('error', 'Error loading addresses');
        res.redirect('/users/profile');
    }
};

exports.addAddress = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const user = await User.findById(userId).populate('addresses');

        if (user.addresses && user.addresses.length >= 3) {
            return res.json({
                success: false,
                message: 'Maximum 3 addresses allowed'
            });
        }

        const newAddress = await Address.create({
            ...req.body,
            user: userId
        });

        // Initialize addresses array if it doesn't exist
        if (!user.addresses) {
            user.addresses = [];
        }

        user.addresses.push(newAddress._id);
        await user.save();

        res.json({
            success: true,
            message: 'Address added successfully'
        });
    } catch (error) {
        console.error('Error adding address:', error);
        res.json({
            success: false,
            message: 'Error adding address'
        });
    }
};

exports.getAddress = async (req, res) => {
    try {
        const address = await Address.findOne({
            _id: req.params.id,
            user: req.session.user.id
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        res.json(address);
    } catch (error) {
        console.error('Error fetching address:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching address'
        });
    }
};

exports.updateAddress = async (req, res) => {
    try {
        const address = await Address.findOneAndUpdate(
            {
                _id: req.params.id,
                user: req.session.user.id
            },
            req.body,
            { new: true }
        );

        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        res.json({
            success: true,
            message: 'Address updated successfully'
        });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating address'
        });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const address = await Address.findOneAndDelete({
            _id: req.params.id,
            user: req.session.user.id
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        await User.findByIdAndUpdate(req.session.user.id, {
            $pull: { addresses: req.params.id }
        });

        res.json({
            success: true,
            message: 'Address deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting address'
        });
    }
};

// Add this function to your existing userController.js
exports.renderResetPasswordPage = (req, res) => {
    const { email } = req.query;
    
    // Check if there's a valid reset session
    if (!email || !req.session.resetEmail || email !== req.session.resetEmail) {
        return res.redirect('/users/forgot-password');
    }

    res.render('users/resetPassword', { 
        email,
        error: null,
        user: null
    });
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.user._id || req.session.user.id;

        console.log('Changing password for user:', userId);

        // Validate input
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (newPassword.length < 6) {
            return res.json({
                success: false,
                message: 'New password must be at least 6 characters'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.json({
                success: false,
                message: 'New passwords do not match'
            });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found:', userId);
            return res.json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if current password is correct using bcrypt directly
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            console.log('Current password is incorrect');
            return res.json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        user.password = hashedPassword;
        await user.save();

        console.log('Password updated successfully for user:', userId);

        res.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.json({
            success: false,
            message: 'Error changing password: ' + error.message
        });
    }
}