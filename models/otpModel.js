const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    otp: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    }
}, { 
    timestamps: true 
});

// Method to check if OTP is expired
otpSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

module.exports = mongoose.model('OTP', otpSchema);




