const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    description: {
        type: String,
        required: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountAmount: {
        type: Number,
        required: true
    },
    minimumPurchase: {
        type: Number,
        default: 0
    },
    maxDiscount: {
        type: Number
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    usageLimit: {
        type: Number,
        default: null
    },
    usedCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usedBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Coupon', couponSchema); 