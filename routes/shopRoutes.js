const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const Product = require('../models/product');
console.log('shopController:', shopController);

// Main shop page (redirects to products)
router.get('/', (req, res) => {
    res.redirect('/shop/products');
});

// Product listing page
router.get('/products', shopController.getAllProducts);

// Product details page
router.get('/products/:productId', shopController.getProductDetails);

// Filter products by category
//router.get('/category/:categoryId', shopController.getProducts);

// API route for getting product data
router.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('category')
            .lean();
            
        if (!product || product.isDeleted) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

module.exports = router; 