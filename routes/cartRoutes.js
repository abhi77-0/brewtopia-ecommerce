const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { isAuthenticated } = require('../middlewares/authMiddleware');

// Apply authentication to all cart routes
router.use(isAuthenticated);

// Cart routes
router.get('/', cartController.getCart);
router.delete('/remove/:productId/:variant', cartController.removeFromCart);
router.post('/add', cartController.addToCart);
router.put('/update', cartController.updateCart);

module.exports = router; 