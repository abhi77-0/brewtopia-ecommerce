const express = require("express");
const path = require("path");
const session = require('express-session');
const userRoutes = require("./routes/userRoutes");
const { connectDB } = require("./config/db"); // Import the connectDB function
const bcrypt = require("bcrypt");

const app = express();

// Set view engine (EJS in this example)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session middleware (add this before routes)
app.use(session({
    secret: 'your-secret-key', // Change this to a secure secret
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware for parsing request bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files middleware (if you need to serve static files)
app.use(express.static(path.join(__dirname, 'public')));

app.use("/users", userRoutes);

// Error handling middleware (add this before database connection)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Connect to the database
connectDB().then(() => {
    // Start the server only after the database connection is established
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
    console.error("Failed to connect to the database:", err);
});
