const Cart = require('../models/shopingCart'); // Make sure the path is correct
const Product = require('../models/product'); // Adjust path as needed

exports.getCart = async (req, res) => {
    try {
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40; // Fixed shipping cost
        const taxRate = 0.18; // 18% tax

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

        const tax = subtotal * taxRate;
        const total = subtotal + shipping + tax;

        res.render('cart/cart', {
            title: 'Shopping Cart',
            user: req.session.user,
            isAuthenticated: true,
            cart: cart || { items: [] },
            hasItems: cart ? cart.items.length > 0 : false,
            itemCount,
            subtotal,
            shipping,
            tax: Math.round(tax),
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

// Add the other cart methods here
exports.updateCartItem = async (req, res) => {
    // ...
};

exports.removeFromCart = async (req, res) => {
    // ...
}; 