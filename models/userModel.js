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
        required: function() {
            // Only require password for local authentication
            return this.authProvider === 'local' || !this.authProvider;
        }
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
    // Referral system fields
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    referredBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    referralCount: {
        type: Number,
        default: 0
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
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    }
}, {
    timestamps: true
});

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ referralCode: 1 });

// Generate referral code before saving
userSchema.pre('save', async function(next) {
    if (!this.referralCode) {
        let code;
        do {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
        } while (await this.constructor.findOne({ referralCode: code }));
        this.referralCode = code;
    }
    next();
});

//const User = mongoose.model('User', userSchema);
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;

