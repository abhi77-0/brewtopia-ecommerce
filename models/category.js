const mongoose = require('mongoose');

// Import Product model to ensure it's loaded first
require('./product');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    
    isVisible: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for product count
categorySchema.virtual('productCount', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'category',
    count: true,
    match: { isDeleted: false }
});

// Export the model, checking if it already exists first
module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);