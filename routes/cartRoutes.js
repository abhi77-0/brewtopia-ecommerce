const express = require('express');
const router = express.Router();
const cartController = require('../controllers/user/cartController');
const { isAuthenticated } = require('../middlewares/authMiddleware');

// Apply authentication to all cart routes
router.use(isAuthenticated);

// Cart routes
router.get('/', cartController.getCart);
router.put('/update', cartController.updateCart);
router.delete('/remove/:productId/:variant', cartController.removeFromCart);
router.post('/add', cartController.addToCart);
router.get('/check/:productId/:variant', cartController.checkItemInCart);

// Add new checkout route
router.get('/checkout', isAuthenticated, cartController.getCheckout);

module.exports = router; 