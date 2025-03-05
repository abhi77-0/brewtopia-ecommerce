
const OTP = require('../models/otpModel');
const nodemailer = require('nodemailer');

// Generate a random 6-digit OTP
function generateRandomOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function generateOTP(email) {
    try {
        // Generate OTP
        const otp = generateRandomOTP();

        // Remove any existing OTP for this email
        await OTP.deleteOne({ email });

        // Create new OTP document
        await OTP.create({
            email,
            otp: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry
        });

        // Send OTP via email
        await sendOTPEmail(email, otp);

        return otp;
    } catch (error) {
        console.error('Error generating OTP:', error);
        throw error;
    }
}

async function verifyOTP(email, userOTP) {
    try {
        // Find OTP document
        const otpDoc = await OTP.findOne({ email });
        
        if (!otpDoc) {
            return false;
        }

        // Comprehensive OTP matching
        const isOTPMatch = 
            otpDoc.otp === userOTP || 
            otpDoc.otp === parseInt(userOTP) || 
            otpDoc.otp.toString() === userOTP;
        
        const isNotExpired = new Date() <= otpDoc.expiresAt;

        if (isOTPMatch && isNotExpired) {
            // Delete the OTP after successful verification
            await OTP.deleteOne({ email });
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error verifying OTP:', error);
        return false;
    }
}

async function sendOTPEmail(email, otp) {
    // Configure your email transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your OTP for Brewtopia',
        text: `Your OTP is: ${otp}. It will expire in 10 minutes.`
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending OTP email:', error);
    }
}

module.exports = {
    generateOTP,
    verifyOTP
};