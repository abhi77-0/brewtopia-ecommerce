const Cart = require('../models/shopingCart');

module.exports = async (req, res, next) => {
    if (req.session && req.session.user) {
        try {
            const cart = await Cart.findOne({ user: req.session.user.id });
            res.locals.cartItemCount = cart ? cart.items.length : 0;
        } catch (error) {
            console.error('Error fetching cart count:', error);
            res.locals.cartItemCount = 0;
        }
    } else {
        res.locals.cartItemCount = 0;
    }
    next();
}; 