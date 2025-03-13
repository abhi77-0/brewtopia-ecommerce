const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Product description is required'],
        trim: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Category is required']
    },
    images: {
        image1: { 
            type: String, 
            required: [true, 'Main product image is required'] 
        },
        image2: { 
            type: String, 
            required: [true, 'Second product image is required'] 
        },
        image3: { 
            type: String, 
            required: [true, 'Third product image is required'] 
        }
    },
    variants: {
        '500ml': {
            price: {
                type: Number,
                required: [true, 'Price for 500ml variant is required'],
                min: [0, 'Price cannot be negative']
            },
            stock: {
                type: Number,
                required: [true, 'Stock for 500ml variant is required'],
                min: [0, 'Stock cannot be negative'],
                default: 0
            }
        },
        '650ml': {
            price: {
                type: Number,
                required: [true, 'Price for 650ml variant is required'],
                min: [0, 'Price cannot be negative']
            },
            stock: {
                type: Number,
                required: [true, 'Stock for 650ml variant is required'],
                min: [0, 'Stock cannot be negative'],
                default: 0
            }
        }
    },
    isVisible: {
        type: Boolean,
        default: true
    },
    
    brand: {
        type: String,
        required: true,
        enum: ['kingfisher', 'heineken', 'budweiser', 'corona', 'carlsberg']
    }
}, {
    timestamps: true
});

// Index for better search performance
productSchema.index({ name: 'text', description: 'text' });

// Method to check if product can be deleted
productSchema.methods.canDelete = async function() {
    // Add logic to check if product has any orders
    // For now, always return true
    return true;
};

// Export the model only if it hasn't been compiled yet
module.exports = mongoose.models.Product || mongoose.model('Product', productSchema); 