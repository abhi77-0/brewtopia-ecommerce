// const Wishlist = require('../../models/Wishlist');
// const Product = require('../../models/Product');

exports.getWishlist = async (req, res) => {
    try {
        let wishlist = await Wishlist.findOne({ user: req.user._id })
            .populate({
                path: 'products',
                model: 'Product', // Explicitly specify the model name
                populate: {
                    path: 'category',
                    model: 'Category' // Explicitly specify the model name
                }
            });

        if (!wishlist) {
            wishlist = { products: [] };
        }

        res.render('users/wishlist', {
            title: 'My Wishlist',
            wishlist
        });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        req.flash('error', 'Failed to fetch wishlist');
        res.redirect('/');
    }
};

exports.addToWishlist = async (req, res) => {
    try {
        const { productId } = req.body;

        let wishlist = await Wishlist.findOne({ user: req.user._id });

        if (!wishlist) {
            wishlist = new Wishlist({
                user: req.user._id,
                products: [productId]
            });
        } else if (!wishlist.products.includes(productId)) {
            wishlist.products.push(productId);
        }

        await wishlist.save();

        res.json({
            success: true,
            message: 'Product added to wishlist'
        });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add to wishlist'
        });
    }
};

exports.removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;

        const wishlist = await Wishlist.findOne({ user: req.user._id });

        if (!wishlist) {
            return res.status(404).json({
                success: false,
                message: 'Wishlist not found'
            });
        }

        wishlist.products = wishlist.products.filter(id => id.toString() !== productId);
        await wishlist.save();

        res.json({
            success: true,
            message: 'Product removed from wishlist'
        });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove from wishlist'
        });
    }
};

exports.getWishlistItems = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user._id });
        
        res.json({
            success: true,
            items: wishlist ? wishlist.products : []
        });
    } catch (error) {
        console.error('Error fetching wishlist items:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wishlist items'
        });
    }
};

// Add this to handle moving items from wishlist to cart
exports.moveToCart = async (req, res) => {
    try {
        const { productId, variant, quantity } = req.body;

        // Add to cart logic (you can reuse your existing cart addition logic here)
        const cartResponse = await fetch('/cart/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ productId, variant, quantity })
        });

        if (!cartResponse.ok) {
            throw new Error('Failed to add to cart');
        }

        // Remove from wishlist
        const wishlist = await Wishlist.findOne({ user: req.user._id });
        if (wishlist) {
            wishlist.products = wishlist.products.filter(id => id.toString() !== productId);
            await wishlist.save();
        }

        res.json({
            success: true,
            message: 'Product moved to cart successfully'
        });
    } catch (error) {
        console.error('Error moving to cart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to move product to cart'
        });
    }
}; 