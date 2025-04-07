const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        variant: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        originalPrice: {
            type: Number,
            required: true
        },
        offerDiscount: {
            type: Number,
            default: 0
        },
        couponDiscount: {
            type: Number,
            default: 0
        },
        finalPrice: {
            type: Number,
            required: true
        },
        returnStatus: {
            type: String,
            enum: ['pending', 'accepted', 'rejected', null],
            default: null
        },
        returnReason: {
            type: String
        },
        returnRequestDate: {
            type: Date
        },
        returnProcessedDate: {
            type: Date
        }
    }],
    address: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address',
        required: true
    },
    total: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Return Accepted'],
        default: 'Pending'
    },
    statusChanged: {
        type: Boolean,
        default: false
    },
    cancelReason: {
        type: String
    },
    returnRequest: {
        type: Boolean,
        default: false
    },
    returnStatus: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', null],
        default: null
    },
    returnReason: {
        type: String
    },
    returnRequestDate: {
        type: Date
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    expectedDeliveryDate: Date,
    deliveredAt: Date,
    subtotal: {
        type: Number,
        required: true
    },
    shippingFee: {
        type: Number,
        required: true
    },
    
    coupon: {
        code: String,
        discount: Number,
        couponId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Coupon'
        }
    },
    offerDiscount: {
        type: Number,
        default: 0
    },
    couponDiscount: {
        type: Number,
        default: 0
    },
    gst: {
        type: Number,
        default: 0
    },
    
    // Fields for tracking refunds in admin wallet
    refundProcessed: {
        type: Boolean,
        default: false
    },
    refundAmount: {
        type: Number
    },
    refundDate: {
        type: Date
    },
    
    // Fields for tracking partial refunds (when removing items)
    partialRefundProcessed: {
        type: Boolean,
        default: false
    },
    partialRefundAmount: {
        type: Number
    },
    partialRefundDate: {
        type: Date
    },
    
    // Fields for tracking return refunds
    returnRefundProcessed: {
        type: Boolean,
        default: false
    },
    returnRefundAmount: {
        type: Number
    },
    returnRefundDate: {
        type: Date
    }
}, {
    timestamps: true
});

// Check if model exists before creating it
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = Order;