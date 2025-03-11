require('dotenv').config();
const express = require("express");
const session = require('express-session');
const nocache = require(`nocache`);
const path = require("path");
const passport = require('passport');
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const shopRoutes = require('./routes/shopRoutes');
const { isAuthenticated, setUserLocals } = require('./middlewares/authMiddleware');
const { connectDB } = require("./config/db");
const bcrypt = require("bcrypt");
const http = require('http');
const cloudinary = require('./config/cloudinary');
const flash = require('connect-flash');
const cartRoutes = require('./routes/cartRoutes');
require('./config/googleAuth');

const app = express();
const server = http.createServer(app);
// Add this AFTER your session middleware and passport initialization
const userMiddleware = require('./middlewares/userMiddleware');
app.use(userMiddleware);

// Set view engine (EJS in this example)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session middleware (add this before routes)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 6 * 60 * 60 * 1000 }
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
app.use(setUserLocals);
app.use( nocache() );
// Set up flash middleware
app.use(flash());

// Make flash messages available to all templates
app.use((req, res, next) => {
    res.locals.success_messages = req.flash('success');
    res.locals.error_messages = req.flash('error');
    next();
});


// Add stock update endpoint
app.post('/admin/products/update-stock', async (req, res) => {
    try {
        const { productId, variantSize, newStock } = req.body;
        
        // Broadcast the stock update to all connected clients
        broadcastStockUpdate(productId, variantSize, newStock);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Stock update error:', error);
        res.status(500).json({ error: 'Failed to update stock' });
    }
});

// Public routes that don't require authentication
app.get('/', (req, res) => {
    res.render('landing', {
        title: 'Welcome to Brewtopia',
        isAuthenticated: req.isAuthenticated(),
        user: req.user
    });
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
app.use('/cart', cartRoutes);

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
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('WebSocket server is running');
        console.log('Google Auth Configuration:');
        console.log('- Client ID exists:', !!process.env.GOOGLE_CLIENT_ID);
        console.log('- Client Secret exists:', !!process.env.GOOGLE_CLIENT_SECRET);
        console.log('- Callback URL:', 'http://localhost:' + PORT + '/users/auth/google/callback');
    });
}).catch(err => {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
});
