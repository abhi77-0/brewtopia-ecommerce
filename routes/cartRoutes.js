const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { isAuthenticated } = require('../middlewares/authMiddleware');

// Apply authentication to all cart routes
router.use(isAuthenticated);

// Cart routes
router.get('/', cartController.getCart);
router.put('/update', cartController.updateCart);
router.delete('/remove/:productId', cartController.removeFromCart);
router.post('/add', cartController.addToCart);

module.exports = router; 