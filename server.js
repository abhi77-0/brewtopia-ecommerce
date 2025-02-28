const express = require("express");
const path = require("path");
const session = require('express-session');
const passport = require('passport');
const userRoutes = require("./routes/userRoutes");
const { connectDB } = require("./config/db"); // Import the connectDB function
const bcrypt = require("bcrypt");
require('dotenv').config();
require('./config/googleAuth');

const app = express();

// Set view engine (EJS in this example)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session middleware (add this before routes)
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport and restore authentication state from session
app.use(passport.initialize());
app.use(passport.session());

// Middleware for parsing request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files middleware (if you need to serve static files)
app.use(express.static(path.join(__dirname, 'public')));

app.use("/users", userRoutes);

// Error handling middleware (add this before database connection)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        error: process.env.NODE_ENV === 'development' 
            ? err.message 
            : 'Something went wrong!'
    });
});

// Connect to the database
connectDB().then(() => {
    // Start the server only after the database connection is established
    const PORT = process.env.PORT || 3000;
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
