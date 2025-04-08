const Wishlist = require('../../models/Wishlist');
const Product = require('../../models/product');

exports.getWishlist = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.redirect('/users/login');
        }
        
        let wishlist = await Wishlist.findOne({ user: userId })
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
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add items to wishlist'
            });
        }

        let wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                user: userId,
                products: [productId]
            });
        } else if (!wishlist.products.includes(productId)) {
            wishlist.products.push(productId);
        }

        await wishlist.save();

        res.json({
            success: true,
            message: 'Product added to wishlist',
            count: wishlist.products.length
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
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to manage wishlist'
            });
        }

        const wishlist = await Wishlist.findOne({ user: userId });

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
            message: 'Product removed from wishlist',
            count: wishlist.products.length
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
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.json({
                success: true,
                items: []
            });
        }
        
        const wishlist = await Wishlist.findOne({ user: userId });
        
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
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to manage wishlist'
            });
        }

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
        const wishlist = await Wishlist.findOne({ user: userId });
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

exports.getWishlistCount = async (req, res) => {
    try {
        const userId = req.session.user?._id || req.session.user?.id;
        
        if (!userId) {
            return res.json({
                success: true,
                count: 0
            });
        }
        
        const wishlist = await Wishlist.findOne({ user: userId });
        const count = wishlist ? wishlist.products.length : 0;
        
        res.json({
            success: true,
            count
        });
    } catch (error) {
        console.error('Error fetching wishlist count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wishlist count'
        });
    }
}; 