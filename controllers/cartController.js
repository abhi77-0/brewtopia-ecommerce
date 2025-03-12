const Cart = require('../models/shopingCart'); // Make sure the path is correct
const Product = require('../models/product'); // Adjust path as needed

exports.getCart = async (req, res) => {
    try {
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40; // Fixed shipping cost
        const discountRate = 0.10; 

        const cart = await Cart.findOne({ user: req.session.user.id })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });

        // Filter out any items where product is null (might have been deleted)
        if (cart) {
            cart.items = cart.items.filter(item => item.product != null);
            
            // Save the cart if any items were filtered out
            await cart.save();

            // Calculate totals for valid items
            cart.items.forEach(item => {
                if (item.product && item.product.variants && item.variant) {
                    const variantPrice = item.product.variants[item.variant]?.price || 0;
                    item.total = variantPrice * item.quantity;
                    subtotal += item.total;
                    itemCount += item.quantity;
                }
            });
        }

        const discount = subtotal * discountRate;
        const total = subtotal + shipping + discount;

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
            total: Math.round(total),
            hideSearch: true // Add this flag to hide search bar
        });
    } catch (error) {
        console.error('Error loading cart:', error);
        res.status(500).render('error', {
            message: 'Error loading cart',
            error: error
        });
    }
};

// Add to cart
exports.addToCart = async (req, res) => {
    try {
        const { productId, variant, quantity } = req.body;
        
        // Validate input
        if (!productId || !variant || !quantity) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        // Validate product exists
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Check if variant exists and has stock
        if (!product.variants[variant] || product.variants[variant].stock < quantity) {
            return res.status(400).json({
                success: false,
                error: 'Selected variant is not available or insufficient stock'
            });
        }

        // Find or create cart for the user
        let cart = await Cart.findOne({ user: req.session.user.id });
        
        if (!cart) {
            cart = new Cart({
                user: req.session.user.id,
                items: []
            });
        }

        // Check if product already exists in cart with same variant
        const existingItemIndex = cart.items.findIndex(
            item => item.product.toString() === productId && item.variant === variant
        );

        if (existingItemIndex > -1) {
            // Update quantity if item exists
            cart.items[existingItemIndex].quantity += parseInt(quantity);
            // Ensure quantity doesn't exceed 5
            if (cart.items[existingItemIndex].quantity > 5) {
                cart.items[existingItemIndex].quantity = 5;
            }
        } else {
            // Add new item to cart
            cart.items.push({
                product: productId,
                variant: variant,
                quantity: Math.min(parseInt(quantity), 5) // Ensure quantity doesn't exceed 5
            });
        }

        await cart.save();

        res.json({
            success: true,
            message: 'Item added to cart successfully',
            cartItemsCount: cart.items.length
        });

    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add item to cart'
        });
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