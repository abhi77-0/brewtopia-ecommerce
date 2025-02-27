const express = require("express");
const path = require("path");
const userRoutes = require("./routes/userRoutes");
const { connectDB } = require("./config/db"); // Import the connectDB function
const bcrypt = require("bcrypt");

const app = express();

// Set view engine (EJS in this example)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true })); // For form submissions
app.use(express.json());

app.use("/", userRoutes);

// Connect to the database
connectDB().then(() => {
    // Start the server only after the database connection is established
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
    console.error("Failed to connect to the database:", err);
});
