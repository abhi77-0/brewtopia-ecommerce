const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const walletTransactionSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order'
    },
    paymentId: {
        type: String
    },
    balance: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const walletSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0
    },
    transactions: [walletTransactionSchema]
}, {
    timestamps: true
});

// Add indexes
walletSchema.index({ userId: 1 });
walletSchema.index({ 'transactions.date': -1 });

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet; 