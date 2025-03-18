const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/user/wishlistController');
const { isAuthenticated } = require('../middlewares/authMiddleware');

router.get('/wishlist', isAuthenticated, wishlistController.getWishlist);
router.get('/wishlist/items', isAuthenticated, wishlistController.getWishlistItems);
router.post('/wishlist/add', isAuthenticated, wishlistController.addToWishlist);
router.post('/wishlist/remove', isAuthenticated, wishlistController.removeFromWishlist);
router.post('/wishlist/move-to-cart', isAuthenticated, wishlistController.moveToCart);

module.exports = router; 