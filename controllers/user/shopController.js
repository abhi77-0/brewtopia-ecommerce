const Product = require('../../models/product');
const Category = require('../../models/category');

// Get all products for shop page
exports.getAllProducts = async (req, res) => {
    try {
        // Get filter parameters
        const categoryId = req.query.category;
        const minPrice = parseInt(req.query.minPrice) || 0;
        const brand = req.query.brand;
        const sort = req.query.sort || '';  // Ensure sort has a default value
        const searchTerm = req.query.search || '';
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        
        // Build query - only check for isVisible since isDeleted doesn't exist
        const query = { 
            isVisible: true  // Only show visible products
        };
        
        if (categoryId) query.category = categoryId;
        if (brand) query.brand = brand;
        
        // Add search term to query if provided
        if (searchTerm) {
            query.name = { $regex: searchTerm, $options: 'i' };
        }

        // Define sort options based on the sort parameter
        const sortOptions = {};
        if (sort === 'price-low') {
            sortOptions['variants.500ml.price'] = 1;  // Ascending order
        } else if (sort === 'price-high') {
            sortOptions['variants.500ml.price'] = -1;  // Descending order
        } else if (sort === 'name-asc') {
            sortOptions.name = 1;  // Alphabetical A-Z
        } else if (sort === 'name-desc') {
            sortOptions.name = -1;  // Alphabetical Z-A
        } else {
            // Default sort by creation date (newest first)
            sortOptions.createdAt = -1;
        }

        // Price filter - modified to be more flexible
        if (minPrice > 0) {
            // Check if we have any products with variants structure first
            const hasVariantProducts = await Product.countDocuments({
                'variants.500ml.price': { $exists: true }
            });
            
            if (hasVariantProducts > 0) {
                query['$or'] = [
                    { 'variants.500ml.price': { $gte: minPrice } },
                    { 'variants.650ml.price': { $gte: minPrice } }
                ];
            } else {
                // Fall back to a regular price field if no variants exist
                query.price = { $gte: minPrice };
            }
        }

        // First get all products to extract unique brands (without price filter)
        const allProducts = await Product.find({ 
            isVisible: true  // Only filter by isVisible
        });
        
        
        const brands = [...new Set(allProducts.map(product => product.brand).filter(Boolean))];

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit) || 1; // Ensure at least 1 page

        // Then fetch filtered products with pagination
        const products = await Product.find(query)
            .populate('category')
            .sort(sortOptions)  // Always use sortOptions now
            .skip(skip)
            .limit(limit);

        
        // Get all categories for the filter sidebar
        const categories = await Category.find();

        res.render('shop/products', {
            title: 'Our Products',
            products,
            categories,
            selectedCategory: categoryId || '',
            selectedBrand: brand || '',
            minPrice: minPrice,
            brands,
            path: '/shop/products',
            sort: sort || '',  
            pagination: {
                page,
                limit,
                totalProducts,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1
            }
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('shop/products', {
            title: 'Our Products',
            products: [],
            categories: [],
            selectedCategory: '',
            selectedBrand: '',
            minPrice: 0,
            brands: [],
            error: 'Error fetching products',
            path: '/shop/products',
            sort: ''  // Add default sort value here too
        });
    }
};

// Get single product details
exports.getProductDetails = async (req, res) => {
    try {
        const productId = req.params.productId;
        
        // Fetch the product with all its details
        const product = await Product.findById(productId);
        
        if (!product) {
            req.flash('error', 'Product not found');
            return res.redirect('/shop/products');
        }

        res.render('shop/product-details', {
            title: product.name,
            product: product,
            user: req.session.user || null,
            path: '/shop/products'
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        req.flash('error', 'Error loading product details');
        res.redirect('/shop/products');
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