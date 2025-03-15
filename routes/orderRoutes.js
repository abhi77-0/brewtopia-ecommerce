const express = require('express');
const router = express.Router();
const orderController = require('../controllers/user/orderController');
const { isAuth, isAuthenticated } = require('../middlewares/authMiddleware');
const Cart = require('../models/shopingCart');

// Orders list route
router.get('/', isAuthenticated, orderController.getOrders);
router.post('/place-order', isAuthenticated, orderController.placeOrder);
router.get('/:id', isAuthenticated, orderController.getOrder);
router.get('/check-cart', isAuthenticated, async (req, res) => {
    try {
        const userId = req.user?._id || req.session?.user?._id;
        const cart = await Cart.findOne({ user: userId })
            .populate('items.product');
        res.json({
            userId: userId,
            cart: cart,
            session: req.session
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get('/:id/details', isAuthenticated, orderController.getOrderDetails);
// Cancel order route
router.delete('/:id/cancel', isAuthenticated, orderController.cancelOrder);
router.post('/:id/return', isAuthenticated, orderController.returnOrder);
router.get('/invoice/:orderId', isAuthenticated, orderController.generateInvoice);

module.exports = router; 