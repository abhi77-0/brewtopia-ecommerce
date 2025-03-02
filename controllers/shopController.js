const Product = require('../models/product');
const Category = require('../models/category');

// Get all products for shop page
exports.getAllProducts = async (req, res) => {
    try {
        // Get filter parameters
        const categoryId = req.query.category;
        
        // Build query
        const query = { isDeleted: false };
        if (categoryId) {
            query.category = categoryId;
        }

        console.log('Query:', query); // Debug log

        // Fetch active categories for filter
        const categories = await Category.find({ isDeleted: false }).sort({ name: 1 });
        
        // Fetch products with category populated
        const products = await Product.find(query)
            .populate('category')
            .sort({ createdAt: -1 });

        console.log('Found products:', products.length); // Debug log
        console.log('First product:', products[0]); // Debug log

        res.render('shop/products', {
            title: 'Our Products',
            products,
            categories,
            selectedCategory: categoryId || '',
            path: '/shop/products'
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('shop/products', {
            title: 'Our Products',
            products: [],
            categories: [],
            selectedCategory: '',
            error: 'Error fetching products',
            path: '/shop/products'
        });
    }
};

// Get single product details
exports.getProductDetails = async (req, res) => {
    try {
        const product = await Product.findOne({
            _id: req.params.productId,
            isDeleted: false
        }).populate('category');

        if (!product) {
            return res.status(404).render('shop/error', {
                title: 'Product Not Found',
                error: 'The requested product could not be found',
                path: '/shop/products'
            });
        }

        res.render('shop/product-details', {
            title: product.name,
            product,
            path: '/shop/products'
        });
    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).render('shop/error', {
            title: 'Error',
            error: 'Error fetching product details',
            path: '/shop/products'
        });
    }
}; 