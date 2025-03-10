const Cart = require('../models/shopingCart'); // Make sure the path is correct
const Product = require('../models/product'); // Adjust path as needed

exports.getCart = async (req, res) => {
    try {
        // Find user's cart and populate product details
        const cart = await Cart.findOne({ user: req.session.user.id })
            .populate('items.product');
        
        // Calculate cart totals
        let subtotal = 0;
        let itemCount = 0;
        
        if (cart && cart.items.length > 0) {
            cart.items.forEach(item => {
                // Calculate item total
                const itemTotal = item.product.price * item.quantity;
                item.total = itemTotal;
                subtotal += itemTotal;
                itemCount += item.quantity;
            });
        }
        
        // Calculate tax and shipping (example values)
        const shipping = subtotal > 0 ? 50 : 0;
        const tax = subtotal > 0 ? Math.round(subtotal * 0.18) : 0; // 18% GST
        const total = subtotal + shipping + tax;
        
        res.render('cart/cart', {
            title: 'Shopping Cart',
            user: req.session.user,
            isAuthenticated: true,
            cart: cart || { items: [] },
            hasItems: cart && cart.items.length > 0,
            subtotal,
            shipping,
            tax,
            total,
            itemCount,
            hideSearch: true // Add this flag to hide search bar
        });
    } catch (error) {
        console.error('Error loading cart:', error);
        res.status(500).send('Error loading cart page');
    }
};

// Add the other cart methods here
exports.updateCartItem = async (req, res) => {
    // ...
};

exports.removeFromCart = async (req, res) => {
    // ...
}; 