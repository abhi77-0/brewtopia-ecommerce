const Cart = require('../../models/shopingCart'); // Make sure the path is correct
const Product = require('../../models/product'); // Adjust path as needed
const User = require('../../models/userModel'); // Added User model import

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

exports.getCheckout = async (req, res) => {
    try {
        const userId = req.session.user.id;
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40; // Fixed shipping cost
        const discountRate = 0.10;

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });
        
        // Get user details with populated addresses
        const user = await User.findById(userId)
            .populate('addresses');
        
        if (!cart || cart.items.length === 0) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }

        // Calculate totals
        cart.items.forEach(item => {
            if (item.product && item.product.variants && item.variant) {
                const variantPrice = item.product.variants[item.variant]?.price || 0;
                item.total = variantPrice * item.quantity;
                subtotal += item.total;
                itemCount += item.quantity;
            }
        });

        const discount = subtotal * discountRate;
        const total = subtotal + shipping - discount;

        // Get the default or first address
        const defaultAddress = user.addresses && user.addresses.length > 0 
            ? user.addresses[0] 
            : null;

        res.render('cart/checkout', {
            title: 'Checkout',
            cart: cart,
            user: user,
            defaultAddress: defaultAddress,
            subtotal: subtotal,
            shipping: shipping,
            discount: Math.round(discount),
            total: Math.round(total),
            itemCount: itemCount
        });

    } catch (error) {
        console.error('Error getting checkout page:', error);
        req.flash('error', 'Error accessing checkout');
        res.redirect('/cart');
    }
};

// Process checkout and create order
exports.processCheckout = async (req, res) => {
    console.log('CHECKOUT PROCESS STARTED');
    console.log('User ID:', req.session.user.id);
    
    try {
        const userId = req.session.user.id;
        const { shippingAddress, paymentMethod } = req.body;
        
        // Get the user's cart with populated product details
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                model: 'Product',
                select: 'name description images variants brand'
            });
            
        if (!cart || cart.items.length === 0) {
            req.flash('error', 'Your cart is empty');
            return res.redirect('/cart');
        }
        
        // Calculate totals
        let subtotal = 0;
        let itemCount = 0;
        const shipping = 40; // Fixed shipping cost
        const discountRate = 0.10;
        
        // Verify stock availability and prepare order items
        let orderItems = [];
        let stockUpdateOperations = [];
        let stockError = null;
        
        for (const item of cart.items) {
            const product = item.product;
            const variant = item.variant;
            const quantity = item.quantity;
            
            // Check if product exists and has the variant
            if (!product || !product.variants || !product.variants[variant]) {
                stockError = `Product ${product ? product.name : 'Unknown'} with variant ${variant} is not available`;
                break;
            }
            
            // Check if enough stock is available
            if (product.variants[variant].stock < quantity) {
                stockError = `Not enough stock for ${product.name} (${variant}). Only ${product.variants[variant].stock} available.`;
                break;
            }
            
            // Calculate item price and add to total
            const price = product.variants[variant].price;
            const itemTotal = price * quantity;
            subtotal += itemTotal;
            itemCount += quantity;
            
            // Prepare order item
            orderItems.push({
                product: product._id,
                name: product.name,
                variant: variant,
                quantity: quantity,
                price: price
            });
            
            // Prepare stock update operation
            const updatePath = `variants.${variant}.stock`;
            stockUpdateOperations.push({
                updateOne: {
                    filter: { _id: product._id },
                    update: { $inc: { [updatePath]: -quantity } }
                }
            });
        }
        
        // If there's a stock error, redirect back with error
        if (stockError) {
            req.flash('error', stockError);
            return res.redirect('/cart/checkout');
        }
        
        // Calculate final amounts
        const discount = subtotal * discountRate;
        const total = subtotal + shipping - discount;
        
        // Get user for shipping address
        const user = await User.findById(userId);
        const addressToUse = user.addresses.find(addr => addr._id.toString() === shippingAddress) || user.addresses[0];
        
        if (!addressToUse) {
            req.flash('error', 'Please add a shipping address');
            return res.redirect('/cart/checkout');
        }
        
        // Create the order
        const Order = require('../../models/Order'); // Import Order model
        
        const order = new Order({
            user: userId,
            items: orderItems,
            subtotal: subtotal,
            shipping: shipping,
            discount: Math.round(discount),
            total: Math.round(total),
            shippingAddress: {
                fullName: addressToUse.fullName,
                addressLine1: addressToUse.addressLine1,
                addressLine2: addressToUse.addressLine2,
                city: addressToUse.city,
                state: addressToUse.state,
                postalCode: addressToUse.postalCode,
                country: addressToUse.country,
                phone: addressToUse.phone
            },
            paymentMethod: paymentMethod,
            status: 'Pending',
            paymentStatus: 'Pending'
        });
        
        // Save the order
        await order.save();
        console.log('ORDER SAVED, ABOUT TO UPDATE STOCK');
        
        // Update stock for each item in the order
        for (const item of cart.items) {
            // Rest of your stock update code...
        }
        
        // Clear the user's cart
        await Cart.findOneAndUpdate(
            { user: userId },
            { $set: { items: [] } }
        );
        
        // Redirect to order confirmation page
        req.flash('success', 'Order placed successfully!');
        res.redirect(`/orders/${order._id}/confirmation`);
        
    } catch (error) {
        console.error('Checkout error:', error);
        req.flash('error', 'An error occurred during checkout');
        res.redirect('/cart/checkout');
    }
};

// Order confirmation page
exports.getOrderConfirmation = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user.id;
        
        // Find the order and make sure it belongs to the current user
        const Order = require('../../models/Order');
        const order = await Order.findOne({ 
            _id: orderId, 
            user: userId 
        }).populate({
            path: 'items.product',
            model: 'Product',
            select: 'name images'
        });
        
        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }
        
        res.render('cart/order-confirmation', {
            title: 'Order Confirmation',
            order: order,
            user: req.session.user
        });
        
    } catch (error) {
        console.error('Error loading order confirmation:', error);
        req.flash('error', 'Error loading order confirmation');
        res.redirect('/orders');
    }
};