const Cart = require('../../models/shopingCart'); 
const Product = require('../../models/product');
const User = require('../../models/userModel');

exports.getCart = async (req, res) => {
    try {
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40; // Fixed shipping cost
        const discountRate = 0.10; 
        const gstRate = 0.18; // 18% GST

        // Get user ID - handle both normal and Google auth users
        const userId = req.session.user._id || req.session.user.id;

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });

        // Filter out any items where product is null (might have been deleted)
        if (cart) {
            cart.items = cart.items.filter(item => item.product != null);
            
            // Process each item to ensure variant data is available
            cart.items.forEach(item => {
                if (item.product && item.product.variants) {
                    // If the variant doesn't exist in the product, create a safe fallback
                    if (!item.product.variants[item.variant]) {
                        // Create a safe default variant
                        item.product.variants[item.variant] = {
                            stock: 0,
                            price: 0,
                            size: 'Unknown'
                        };
                    }
                    
                    // Calculate item total
                    const variantPrice = item.product.variants[item.variant]?.price || 0;
                    item.total = variantPrice * item.quantity;
                    subtotal += item.total;
                    itemCount += item.quantity;
                }
            });
            
            // Save the cart if any items were filtered out
            await cart.save();
        }

        const discount = subtotal * discountRate;
        const gst = Math.round(subtotal * gstRate);
        const total = subtotal + shipping - discount + gst;

        res.render('cart/cart', {
            title: 'Shopping Cart',
            user: req.session.user,
            isAuthenticated: true,
            cart: cart || { items: [] },
            hasItems: cart ? cart.items.length > 0 : false,
            itemCount,
            subtotal,
            shipping,
            discount: Math.round(discount),
            gst,
            total: Math.round(total),
            hideSearch: true // Add this flag to hide search bar
        });
    } catch (error) {
        console.error('Error fetching cart:', error);
        req.flash('error', 'Failed to load cart');
        res.redirect('/users/home');
    }
};

// Add to cart
exports.addToCart = async (req, res) => {
    try {
        const { productId, variant, quantity } = req.body;
        
        // Check if user is logged in
        if (!req.session.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Please log in to add items to your cart' 
            });
        }
        
        // Get user ID - handle both normal and Google auth users
        const userId = req.session.user._id || req.session.user.id;
        
        if (!userId) {
            console.error('User session exists but no ID found:', req.session.user);
            return res.status(401).json({ 
                success: false, 
                message: 'User identification error. Please log out and log in again.' 
            });
        }
        
        console.log('Adding to cart for user:', userId);

        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            // Create new cart if it doesn't exist
            cart = await Cart.create({
                user: userId,
                items: []
            });
        }

        // Add item to cart
        const existingItem = cart.items.find(
            item => item.product.toString() === productId && item.variant === variant
        );

        if (existingItem) {
            existingItem.quantity += parseInt(quantity);
        } else {
            cart.items.push({
                product: productId,
                variant: variant,
                quantity: parseInt(quantity)
            });
        }

        await cart.save();
        res.json({ success: true });

    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}; 

// Update cart item quantity
exports.updateCart = async (req, res) => {
    try {
        const { productId, quantity } = req.body;

        // Validate input
        if (!productId || !quantity || quantity < 1 || quantity > 5) {
            return res.status(400).json({
                success: false,
                error: 'Invalid quantity. Must be between 1 and 5.'
            });
        }

        // Find user's cart
        const cart = await Cart.findOne({ user: req.session.user.id });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                error: 'Cart not found'
            });
        }

        // Find the item in the cart
        const cartItem = cart.items.find(item => 
            item.product.toString() === productId
        );

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                error: 'Item not found in cart'
            });
        }

        // Update quantity
        cartItem.quantity = parseInt(quantity);
        await cart.save();

        res.json({
            success: true,
            message: 'Cart updated successfully'
        });

    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update cart'
        });
    }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
    try {
        const { productId, variant } = req.params;
        const userId = req.session.user.id;

        // Find the cart and update it
        const result = await Cart.updateOne(
            { user: userId },
            { $pull: { items: { product: productId, variant: variant } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        res.status(200).json({ message: 'Item removed successfully' });

    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({ message: 'Error removing item from cart' });
    }
};

exports.checkItemInCart = async (req, res) => {
    try {
        const { productId, variant } = req.params;
        const userId = req.session.user.id;

        const cart = await Cart.findOne({ user: userId });
        
        if (!cart) {
            return res.json({ exists: false });
        }

        const itemExists = cart.items.some(item => 
            item.product.toString() === productId && 
            item.variant === variant
        );

        res.json({ exists: itemExists });

    } catch (error) {
        console.error('Error checking cart:', error);
        res.status(500).json({ error: 'Failed to check cart' });
    }
};