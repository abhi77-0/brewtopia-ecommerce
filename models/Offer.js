const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['product', 'category', 'referral']
    },
    discountType: {
        type: String,
        required: true,
        enum: ['percentage', 'fixed']
    },
    discountAmount: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscountAmount: {
        type: Number,
        min: 0
    },
    applicableTo: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        // This will reference either Product or Category based on type
        refPath: 'type'
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    minimumPurchaseAmount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add index for better query performance
offerSchema.index({ type: 1, applicableTo: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Offer', offerSchema); 