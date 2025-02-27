const { getDB } = require("./db");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Generate and store OTP in MongoDB
async function generateOTP(email) {
    const db = getDB();
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Expire in 5 minutes

    // Save OTP to DB (upsert: update if exists, insert if not)
    await db.collection("otps").updateOne(
        { email },
        { $set: { otp, expiresAt } },
        { upsert: true }
    );

    // Send OTP via email
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP is: ${otp}`
    });

    return otp;
}

// Verify OTP from MongoDB
async function verifyOTP(email, enteredOTP) {
    const db = getDB();
    const otpRecord = await db.collection("otps").findOne({ email });

    if (!otpRecord) return false; // No OTP found
    if (otpRecord.otp !== parseInt(enteredOTP)) return false; // Incorrect OTP
    if (new Date() > otpRecord.expiresAt) return false; // OTP expired

    // Delete OTP after successful verification
    await db.collection("otps").deleteOne({ email });
    return true;
}

module.exports = { generateOTP, verifyOTP };
