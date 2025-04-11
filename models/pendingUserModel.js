const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const pendingUserSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: [true, 'Password is required']
    },
    referralCode: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 3600 // Documents will be automatically deleted after 1 hour
    }
});

// Add index for email field
pendingUserSchema.index({ email: 1 });

// Add index for automatic document expiration
pendingUserSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

const PendingUser = mongoose.model('PendingUser', pendingUserSchema);

module.exports = PendingUser; 