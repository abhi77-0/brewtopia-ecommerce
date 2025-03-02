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

const Category = mongoose.model('Category', categorySchema);

module.exports = Category; 