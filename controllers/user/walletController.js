const Wallet = require('../../models/walletModel');
const User = require('../../models/userModel');
const Order = require('../../models/Order');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Add these at the top with your other requires
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Export individual functions instead of an object
exports.getWalletPage = async (req, res) => {
    try {
        // Get user ID from either req.user or req.session.user
        const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            console.log('User not authenticated:', { user: req.user, session: req.session });
            return res.redirect('/users/login');
        }

        // Find or create wallet
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = await Wallet.create({
                userId,
                balance: 0,
                transactions: []
            });
            
            // Update user with wallet reference
            await User.findByIdAndUpdate(userId, { wallet: wallet._id });
        }

        res.render('users/wallet', {
            title: 'My Wallet',
            wallet: wallet,
            user: req.session.user || req.user
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.redirect('/error');
    }
};

exports.addMoney = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const user = await User.findById(userId);
        if (!user.wallet) {
            let wallet = await Wallet.create({
                userId,
                balance: 0,
                transactions: []
            });
            user.wallet = wallet._id;
            await user.save();
        }

        user.wallet.balance += Number(amount);
        user.wallet.transactions.push({
            amount: Number(amount),
            type: 'credit',
            description: 'Added money to wallet'
        });

        await user.save();

        res.json({
            success: true,
            message: 'Money added successfully',
            newBalance: user.wallet.balance
        });
    } catch (error) {
        console.error('Error adding money:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add money'
        });
    }
};

exports.processCancelRefund = async (orderId, userId) => {
    try {
        const order = await Order.findById(orderId);
        let wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            wallet = await Wallet.create({
                userId,
                balance: 0,
                transactions: []
            });
            await User.findByIdAndUpdate(userId, { wallet: wallet._id });
        }

        const refundAmount = order.total;
        const newBalance = wallet.balance + refundAmount;
        wallet.balance = newBalance;

        wallet.transactions.push({
            userId,
            amount: refundAmount,
            type: 'credit',
            description: `Refund for cancelled order #${order._id.toString().slice(-6).toUpperCase()}`,
            orderId: order._id,
            date: new Date(),
            balance: newBalance
        });

        await wallet.save();
        return true;
    } catch (error) {
        console.error('Error processing cancel refund:', error);
        return false;
    }
};

exports.processReturnRefund = async (orderId, userId) => {
    try {
        const order = await Order.findById(orderId);
        let wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            wallet = await Wallet.create({
                userId,
                balance: 0,
                transactions: []
            });
            await User.findByIdAndUpdate(userId, { wallet: wallet._id });
        }

        const refundAmount = order.total;
        const newBalance = wallet.balance + refundAmount;
        wallet.balance = newBalance;

        wallet.transactions.push({
            userId,
            amount: refundAmount,
            type: 'credit',
            description: `Refund for returned order #${order._id.toString().slice(-6).toUpperCase()}`,
            orderId: order._id,
            date: new Date(),
            balance: newBalance
        });

        await wallet.save();
        return true;
    } catch (error) {
        console.error('Error processing return refund:', error);
        return false;
    }
};

exports.useWalletBalance = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const user = await User.findById(userId);
        if (!user.wallet || user.wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient wallet balance'
            });
        }

        user.wallet.balance -= amount;
        user.wallet.transactions.push({
            amount: amount,
            type: 'debit',
            description: 'Used for order payment'
        });

        await user.save();

        res.json({
            success: true,
            message: 'Payment successful',
            newBalance: user.wallet.balance
        });
    } catch (error) {
        console.error('Error using wallet balance:', error);
        res.status(500).json({
            success: false,
            message: 'Payment failed'
        });
    }
};

// Modify the addMoney function to create Razorpay order
exports.createWalletOrder = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }
        
        const options = {
            amount: amount * 100,
            currency: "INR",
            receipt: "wallet_" + Date.now(),
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            order: order,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating wallet order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
};

// Add verification and wallet update function
exports.verifyWalletPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
        const userId = req.user?._id || req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // Verify payment signature
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature === expectedSign) {
            // Find or create wallet
            let wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                wallet = await Wallet.create({
                    userId,
                    balance: 0,
                    transactions: []
                });
                await User.findByIdAndUpdate(userId, { wallet: wallet._id });
            }

            // Update wallet balance
            const newBalance = wallet.balance + Number(amount);
            wallet.balance = newBalance;
            
            // Add transaction
            wallet.transactions.push({
                userId,
                amount: Number(amount),
                type: 'credit',
                description: `Added money via Razorpay`,
                paymentId: razorpay_payment_id,
                balance: newBalance
            });

            await wallet.save();

            res.json({
                success: true,
                message: 'Payment verified and wallet updated',
                newBalance: wallet.balance
            });
        } else {
            throw new Error('Payment verification failed');
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
}; 