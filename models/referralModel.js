const mongoose = require('mongoose');

const referralSettingsSchema = new mongoose.Schema({
    referrerAmount: {
        type: Number,
        required: true,
        default: 60 // Default amount for referrer
    },
    refereeAmount: {
        type: Number,
        required: true,
        default: 40 // Default amount for referee
    },
    isActive: {
        type: Boolean,
        default: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const ReferralSettings = mongoose.model('ReferralSettings', referralSettingsSchema);

module.exports = ReferralSettings; 