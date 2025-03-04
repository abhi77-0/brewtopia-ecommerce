const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const otpSchema = new Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    otp: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300 // OTP expires after 5 minutes
    },
    resendCount: {
        type: Number,
        default: 0
    }
});

// Add methods
otpSchema.methods.isExpired = function() {
    const now = new Date();
    const createdAt = this.createdAt;
    const diffInSeconds = (now - createdAt) / 1000;
    return diffInSeconds > 300; // 5 minutes
};

// Add indexes
otpSchema.index({ email: 1 });
otpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300 });

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP; 