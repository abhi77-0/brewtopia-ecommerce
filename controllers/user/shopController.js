const Product = require('../../models/product');
const Category = require('../../models/category');

// Get all products for shop page
exports.getAllProducts = async (req, res) => {
    try {
        console.log('=== USER PRODUCTS LISTING ===');
        
        // Get filter parameters
        const categoryId = req.query.category || '';
        const minPrice = parseInt(req.query.minPrice) || 100;
        const brand = req.query.brand || '';
        const sort = req.query.sort || '';
        const searchTerm = req.query.search || '';
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 9;
        const skip = (page - 1) * limit;
        
        // Get categories
        const categories = await Category.find().sort({ name: 1 });
        
        // Build query
        const query = {
            isVisible: true
        };
        
        if (categoryId) query.category = categoryId;
        if (brand) query.brand = brand;
        if (searchTerm) {
            query.name = { $regex: searchTerm, $options: 'i' };
        }

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);
        
        // Get products
        const products = await Product.find(query)
            .populate('category')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get available brands
        const availableBrands = [...new Set(
            (await Product.find({ isVisible: true }).distinct('brand'))
        )];

        // Create pagination object
        const pagination = {
            page,
            limit,
            totalProducts,
            totalPages,
            hasPrevPage: page > 1,
            hasNextPage: page < totalPages,
            prevPage: page - 1,
            nextPage: page + 1
        };

        res.render('shop/products', {
            title: 'Our Products',
            products,
            categories,
            selectedCategory: categoryId,
            brands: availableBrands,
            selectedBrand: brand,
            minPrice,
            searchTerm,
            sort,
            pagination,  // Add the pagination object
            path: '/shop/products',
            error: null
        });

    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('shop/products', {
            title: 'Our Products',
            products: [],
            categories: [],
            selectedCategory: '',
            brands: [],
            selectedBrand: '',
            minPrice: 100,
            searchTerm: '',
            sort: '',
            pagination: {  // Add default pagination for error state
                page: 1,
                limit: 9,
                totalProducts: 0,
                totalPages: 0,
                hasPrevPage: false,
                hasNextPage: false,
                prevPage: 1,
                nextPage: 1
            },
            path: '/shop/products',
            error: 'Error fetching products: ' + error.message
        });
    }
};

// Get single product details
exports.getProductDetails = async (req, res) => {
    try {
        const product = await Product.findOne({
            _id: req.params.productId,
            isDeleted: false,
            isVisible: true  // Only show visible products
        }).populate('category');

        if (!product) {
            return res.status(404).render('shop/error', {
                title: 'Product Not Found',
                error: 'The requested product could not be found',
                path: '/shop/products'
            });
        }
        let similarProducts = [];
        
        if (product.category) {
            similarProducts = await Product.find({
                category: product.category._id, // Using the ID from the populated category
                _id: { $ne: product._id }, // Exclude current product
                isDeleted: false
            }).limit(4);
        }
        

        res.render('shop/product-details', {
            title: product.name,
            product,
            similarProducts: similarProducts, // Explicitly name the variable
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

// Update search autocomplete to only show visible products
exports.searchProductsAutocomplete = async (req, res) => {
    try {
        const searchTerm = req.query.term;
        
        if (!searchTerm || searchTerm.length < 2) {
            return res.json([]);
        }
        
        // Search for visible products matching the search term
        const products = await Product.find({
            name: { $regex: searchTerm, $options: 'i' },
            isDeleted: false,
            isVisible: true  // Only show visible products
        })
        .select('name images _id')
        .limit(5);
        
        // ... rest of your existing code ...
    } catch (error) {
        // ... existing error handling ...
    }
}; 