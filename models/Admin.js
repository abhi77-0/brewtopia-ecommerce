const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    role: {
        type: String,
        default: 'admin'
    },
    lastLogin: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Simple password comparison without hashing
adminSchema.methods.comparePassword = function(candidatePassword) {
    return this.password === candidatePassword;
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin; 