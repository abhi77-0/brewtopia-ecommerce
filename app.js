const express = require("express");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const path = require("path");
const bodyParser = require("body-parser");
const { google } = require("googleapis");

require("dotenv").config(); // Load environment variables


const app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // To handle JSON requests

// OAuth2 Client Setup
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;

const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);
if (!REFRESH_TOKEN) {
    console.error("Error: REFRESH_TOKEN is missing from .env file");
    process.exit(1);
}
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });


// Function to Send OTP Email
async function sendOtpEmail(email, name) {
    try {
        const accessToken = await oAuth2Client.getAccessToken();

        if (!accessToken.token) {
            throw new Error("Failed to retrieve Access Token");
        }

        const otp = Math.floor(100000 + Math.random() * 900000); // Generate 6-digit OTP

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                type: "OAuth2",
                user: EMAIL_USER,
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET,
                refreshToken: REFRESH_TOKEN,
                accessToken: accessToken.token,
            },
            tls: {
                rejectUnauthorized: false, // 👈 Add this line
            },
        });
        

        const mailOptions = {
            from: `"Brewtopia" <${EMAIL_USER}>`,
            to: email,
            subject: "Your OTP for Signup",
            text: `Hello ${name},\n\nYour OTP for signup is: ${otp}.\n\nThanks,\nTeam Brewtopia`,
            html: `<h3>Hello ${name},</h3><p>Your OTP for signup is: <b>${otp}</b></p><p>Thanks,<br>Team Brewtopia</p>`,
        };

        await transporter.sendMail(mailOptions);
        return otp; // Return OTP for validation
    } catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
}


// Route to Render Signup Page
app.get("/", (req, res) => {
    res.render("signup");
});

// Handle Signup and Send OTP
app.post("/signup", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).send("All fields are required!");
    }

    try {
        const otp = await sendOtpEmail(email, name);
        res.json({ message: "OTP sent successfully!", otp }); // Return OTP for verification (for now)
    } catch (error) {
        res.status(500).send("Failed to send OTP. Try again.");
    }
});

console.log("Refresh Token:", process.env.REFRESH_TOKEN);


// Start Server
app.listen(3002, () => {
    console.log("Server is running on port 3002");
});
