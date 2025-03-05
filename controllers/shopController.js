const Product = require('../models/product');
const Category = require('../models/category');

// Get all products for shop page
exports.getAllProducts = async (req, res) => {
    try {
        // Get filter parameters
        const categoryId = req.query.category;
        const minPrice = parseInt(req.query.minPrice) || 100;
        const brand = req.query.brand;
        const sort = req.query.sort;
        
        // Build query
        const query = { isDeleted: false };
        if (categoryId) query.category = categoryId;
        if (brand) query.brand = brand;

        // Price filter for both variants
        if (minPrice) {
            query['$or'] = [
                { 'variants.500ml.price': { $gte: minPrice } },
                { 'variants.650ml.price': { $gte: minPrice } }
            ];
        }

        // Build sort options
        let sortOptions = {};
        switch(sort) {
            case 'price-low':
                sortOptions = { 'variants.500ml.price': 1 };
                break;
            case 'price-high':
                sortOptions = { 'variants.500ml.price': -1 };
                break;
            case 'name-asc':
                sortOptions = { name: 1 };
                break;
            case 'name-desc':
                sortOptions = { name: -1 };
                break;
            default:
                sortOptions = { createdAt: -1 };
        }

        // Fetch active categories for filter
        const categories = await Category.find({ isDeleted: false }).sort({ name: 1 });
        
        // First get all products to extract unique brands
        const allProducts = await Product.find({ isDeleted: false });
        const brands = [...new Set(allProducts.map(product => product.brand).filter(Boolean))];

        // Then fetch filtered products
        const products = await Product.find(query)
            .populate('category')
            .sort(sortOptions);

        console.log('Query:', query);
        console.log('Found products:', products.length);
        console.log('Available brands:', brands);
        console.log('Selected brand:', brand);
        console.log('Min price:', minPrice);

        res.render('shop/products', {
            title: 'Our Products',
            products,
            categories,
            selectedCategory: categoryId || '',
            selectedBrand: brand || '',
            minPrice: minPrice,
            brands,
            path: '/shop/products',
            sort: sort || ''
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('shop/products', {
            title: 'Our Products',
            products: [],
            categories: [],
            selectedCategory: '',
            selectedBrand: '',
            minPrice: 100,
            brands: [],
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