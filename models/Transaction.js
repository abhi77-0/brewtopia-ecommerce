const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        default: null
    },
    transactionId: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        enum: ['refund', 'cashback', 'purchase', 'promotion'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'completed'
    }
}, { timestamps: true });

// Generate a unique transaction ID before saving
transactionSchema.pre('save', async function(next) {
    if (!this.transactionId) {
        const date = new Date();
        const prefix = 'TXN';
        const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const timestamp = date.getTime().toString().slice(-6);
        this.transactionId = `${prefix}${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}${randomPart}${timestamp}`;
    }
    next();
});

module.exports = mongoose.model('Transaction', transactionSchema); 