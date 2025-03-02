const express = require("express");
const path = require("path");
const session = require('express-session');
const passport = require('passport');
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const shopRoutes = require('./routes/shopRoutes');
const { connectDB } = require("./config/db");
const bcrypt = require("bcrypt");
require('dotenv').config();
require('./config/googleAuth');

const app = express();

// Set view engine (EJS in this example)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session middleware (add this before routes)
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Middleware for parsing request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files middleware
app.use(express.static(path.join(__dirname, 'public')));

// Global middleware to check auth status
app.use((req, res, next) => {
    res.locals.isAuthenticated = req.isAuthenticated();
    res.locals.user = req.user;
    next();
});

// Custom middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/users/login');
};

// Public routes that don't require authentication
app.get('/', (req, res) => {
    res.redirect('/shop');
});

// Apply authentication check to specific routes
app.use('/users/products', isAuthenticated);
app.use('/users/cart', isAuthenticated);
app.use('/users/wishlist', isAuthenticated);
app.use('/users/profile', isAuthenticated);

// Use routes
app.use("/users", userRoutes);
app.use("/admin", adminRoutes);
app.use('/shop', shopRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        error: process.env.NODE_ENV === 'development' 
            ? err.message 
            : 'Something went wrong!',
        isAuthenticated: req.isAuthenticated(),
        user: req.user
    });
});

// Connect to the database
connectDB().then(() => {
    // Start the server
    const PORT = process.env.PORT || 3004;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('Google Auth Configuration:');
        console.log('- Client ID exists:', !!process.env.GOOGLE_CLIENT_ID);
        console.log('- Client Secret exists:', !!process.env.GOOGLE_CLIENT_SECRET);
        console.log('- Callback URL:', 'http://localhost:' + PORT + '/users/auth/google/callback');
    });
}).catch(err => {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
});
