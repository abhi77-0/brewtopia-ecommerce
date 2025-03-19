const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/user/wishlistController');
const { isAuthenticated } = require('../middlewares/authMiddleware');

router.get('/users/wishlist', isAuthenticated, wishlistController.getWishlist);
router.get('/users/wishlist/items', isAuthenticated, wishlistController.getWishlistItems);
router.post('/users/wishlist/add', isAuthenticated, wishlistController.addToWishlist);
router.post('/users/wishlist/remove', isAuthenticated, wishlistController.removeFromWishlist);
router.post('/users/wishlist/move-to-cart', isAuthenticated, wishlistController.moveToCart);

module.exports = router; 