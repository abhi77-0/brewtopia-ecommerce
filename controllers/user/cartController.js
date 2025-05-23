const Cart = require('../../models/shopingCart'); 
const Product = require('../../models/product');
const User = require('../../models/userModel');

// Add this function at the top of your file
const calculateBestOffer = (product) => {
    try {
        let bestOffer = null;
        let discountPercentage = 0;

        const now = new Date();

        // Check product offer
        if (product.offer && 
            product.offer.isActive !== false && 
            now >= new Date(product.offer.startDate) && 
            now <= new Date(product.offer.endDate)) {
            bestOffer = product.offer;
            discountPercentage = product.offer.discountPercentage;
        }

        // CHECK CATEGORY OFFER
        if (product.categoryOffer && 
            product.categoryOffer.isActive !== false && 
            now >= new Date(product.categoryOffer.startDate) && 
            now <= new Date(product.categoryOffer.endDate)) {
            
            // Use category offer if it's better than product offer
            if (!bestOffer || product.categoryOffer.discountPercentage > discountPercentage) {
                bestOffer = product.categoryOffer;
                discountPercentage = product.categoryOffer.discountPercentage;
            }
        }

        return {
            bestOffer,
            discountPercentage: parseFloat(discountPercentage) || 0
        };
    } catch (error) {
        console.error('Error calculating best offer:', error);
        return {
            bestOffer: null,
            discountPercentage: 0
        };
    }
};

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
                select: 'name description images variants brand offer categoryOffer isVisible isDeleted',
                populate: [
                    { path: 'offer' },
                    { path: 'categoryOffer' }
                ]
            });

        // Filter out any items where product is null, not visible, or deleted
        if (cart) {
            cart.items = cart.items.filter(item => 
                item.product != null && 
                item.product.isVisible === true &&
                item.product.isDeleted !== true
            );
            
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
            calculateBestOffer, // Pass the function to the template
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
        
        // Calculate the number of unique products in the cart
        const uniqueProductCount = cart.items.length;
        
        res.json({ 
            success: true,
            count: uniqueProductCount
        });

    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}; 

// Update cart item quantity
exports.updateCart = async (req, res) => {
    try {
        const { productId, variant, quantity } = req.body;  // Extract variant from req.body
        
        // Get user ID - handle both normal and Google auth users
        const userId = req.session.user._id || req.session.user.id;
        
        let cart = await Cart.findOne({ user: userId });
        
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }
        
        // Find the item in the cart
        const itemIndex = cart.items.findIndex(
            item => item.product.toString() === productId && item.variant === variant
        );
        
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }
        
        // Update quantity
        cart.items[itemIndex].quantity = parseInt(quantity);
        
        // Save the cart
        await cart.save();

        // Populate the updated cart with product details for calculating prices
        cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name images variants brand offer categoryOffer',
                populate: [
                    { path: 'offer' },
                    { path: 'categoryOffer' }
                ]
            });
        
        // Calculate cart totals
        let subtotal = 0;
        let itemCount = 0;
        
        cart.items.forEach(item => {
            if (item.product && item.product.variants && item.product.variants[item.variant]) {
                const variantPrice = item.product.variants[item.variant].price;
                item.total = variantPrice * item.quantity;
                subtotal += item.total;
                itemCount += item.quantity;
            }
        });
        
        // Return the updated cart data as JSON
        return res.json({ 
            success: true, 
            message: 'Cart updated successfully',
            cartData: {
                items: cart.items,
                subtotal: subtotal,
                itemCount: itemCount
            }
        });
        
    } catch (error) {
        console.error('Error updating cart:', error);
        return res.status(500).json({ success: false, error: error.message });
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

        // Get the updated cart to calculate the new count
        const updatedCart = await Cart.findOne({ user: userId });
        const totalItems = updatedCart ? updatedCart.items.reduce((total, item) => total + item.quantity, 0) : 0;

        res.status(200).json({ 
            message: 'Item removed successfully',
            count: totalItems
        });

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

// Get cart count
exports.getCartCount = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({
                success: true,
                count: 0
            });
        }

        // Get user ID - handle both normal and Google auth users
        const userId = req.session.user._id || req.session.user.id;
        
        if (!userId) {
            return res.json({
                success: true,
                count: 0
            });
        }

        const cart = await Cart.findOne({ user: userId });
        
        if (!cart || !cart.items) {
            return res.json({
                success: true,
                count: 0
            });
        }

        // Count the number of unique products in the cart
        const count = cart.items.length;
        
        res.json({
            success: true,
            count
        });
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch cart count'
        });
    }
};