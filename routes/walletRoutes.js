const express = require('express');
const router = express.Router();
const { 
    getWalletPage, 
    addMoney, 
    useWalletBalance,
    createWalletOrder,
    verifyWalletPayment
} = require('../controllers/user/walletController');
const {isAuthenticated} = require('../middlewares/authMiddleware');

// Wallet page
router.get('/', isAuthenticated, getWalletPage);

// Add money to wallet
router.post('/add', isAuthenticated, addMoney);

// Use wallet balance
router.post('/use', isAuthenticated, useWalletBalance);

// Add these routes
router.post('/create-order', isAuthenticated, createWalletOrder);
router.post('/verify-payment', isAuthenticated, verifyWalletPayment);

module.exports = router; 