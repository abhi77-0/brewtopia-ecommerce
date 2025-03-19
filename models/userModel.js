const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
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
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    phone: {
        type: String,
        trim: true
    },
    profileImage: {
        type: String,
        default: '/images/default-profile.png'
    },
    addresses: [{
        type: Schema.Types.ObjectId,
        ref: 'Address'
    }],
    lastLogin: {
        type: Date
    },
    blocked: {
        type: Boolean,
        default: false
    },
    // For email verification
    newEmail: String,
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    // For password reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    googleId: {
        type: String,
        sparse: true
    },
    picture: {
        type: String
    },
    // Replace wallet fields with wallet reference
    wallet: {
        type: Schema.Types.ObjectId,
        ref: 'Wallet'
    }
}, {
    timestamps: true
});

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

//const User = mongoose.model('User', userSchema);
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;

