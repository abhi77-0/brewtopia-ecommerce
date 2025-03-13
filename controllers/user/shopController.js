const Product = require('../../models/product');
const Category = require('../../models/category');

// Get all products for shop page
exports.getAllProducts = async (req, res) => {
    try {
        // Get filter parameters
        const categoryId = req.query.category;
        const minPrice = parseInt(req.query.minPrice) || 100;
        const brand = req.query.brand;
        const sort = req.query.sort;
        const searchTerm = req.query.search || '';
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 9;
        const skip = (page - 1) * limit;
        
        // Build query - only show visible and not deleted products
        const query = { 
            isDeleted: false,
            isVisible: true  // Only show visible products
        };
        
        if (categoryId) query.category = categoryId;
        if (brand) query.brand = brand;
        
        // Add search term to query if provided
        if (searchTerm) {
            query.name = { $regex: searchTerm, $options: 'i' };
        }

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

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Then fetch filtered products with pagination
        const products = await Product.find(query)
            .populate('category')
            .sort(sortOptions)
            .skip(skip)
            .limit(limit);

        // Create a function to construct page URLs
        const constructPageUrl = (pageNum) => {
            // Start with the base URL
            let url = '/shop/products?';
            
            // Add all current query parameters except page
            if (categoryId) url += `category=${categoryId}&`;
            if (minPrice && minPrice > 100) url += `minPrice=${minPrice}&`;
            if (brand) url += `brand=${brand}&`;
            if (sort) url += `sort=${sort}&`;
            
            // Add the page parameter
            url += `page=${pageNum}`;
            
            return url;
        };

        console.log('Query:', query);
        console.log('Found products:', products.length);
        console.log('Available brands:', brands);
        console.log('Selected brand:', brand);
        console.log('Min price:', minPrice);
        console.log('Page:', page, 'of', totalPages);

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
            },
            constructPageUrl // Pass the function to the template
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
        console.log('=== PRODUCT DETAILS DEBUG ===');
        console.log('Product ID:', req.params.productId);
        
        // Find the product and populate category
        const product = await Product.findOne({
            _id: req.params.productId,
            isVisible: true
        }).populate('category');
        
        console.log('Product found:', product ? 'Yes' : 'No');
        
        if (!product) {
            console.log('Product not found or not visible');
            return res.status(404).render('shop/error', {
                title: 'Product Not Found',
                error: 'The requested product could not be found',
                path: '/shop/products'
            });
        }
        
        console.log('Product details:', {
            name: product.name,
            category: product.category ? product.category.name : 'No category',
            isVisible: product.isVisible,
            variants: Object.keys(product.variants)
        });
        
        // Get similar products from the same category
        let similarProducts = [];
        if (product.category) {
            similarProducts = await Product.find({
                category: product.category._id,
                _id: { $ne: product._id },  // Exclude current product
                isVisible: true
            })
            .limit(4)
            .populate('category');
            
            console.log(`Found ${similarProducts.length} similar products`);
        }

        res.render('shop/product-details', {
            title: product.name,
            product,
            similarProducts,
            path: '/shop/products'
        });
        
    } catch (error) {
        console.error('Error fetching product details:', error);
        console.error('Error stack:', error.stack);
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