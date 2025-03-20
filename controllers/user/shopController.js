const Product = require('../../models/product');
const Category = require('../../models/category');

// Get all products for shop page
exports.getAllProducts = async (req, res) => {
    try {
        // Get filter parameters
        const categoryId = req.query.category;
        const minPrice = parseInt(req.query.minPrice) || 0;
        const brand = req.query.brand;
        const sort = req.query.sort || '';
        const searchTerm = req.query.search || '';
        
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        
        // Build query - only show visible products
        const query = { 
            isVisible: true
        };
        
        // If category filter is applied, check if the category is visible
        if (categoryId) {
            // First check if the category is visible
            const category = await Category.findOne({ 
                _id: categoryId,
                isVisible: true 
            });
            
            // Only apply category filter if the category exists and is visible
            if (category) {
                query.category = categoryId;
            } else {
                // If category is not visible, return no products
                return res.render('shop/products', {
                    title: 'Our Products',
                    products: [],
                    categories: [],
                    selectedCategory: '',
                    selectedBrand: '',
                    minPrice: 0,
                    brands: [],
                    path: '/shop/products',
                    sort: '',
                    pagination: {
                        page: 1,
                        limit,
                        totalProducts: 0,
                        totalPages: 1,
                        hasNextPage: false,
                        hasPrevPage: false,
                        nextPage: 1,
                        prevPage: 1
                    }
                });
            }
        }
        
        if (brand) query.brand = brand;
        
        // Add search term to query if provided
        if (searchTerm) {
            query.name = { $regex: searchTerm, $options: 'i' };
        }

        // Define sort options based on the sort parameter
        const sortOptions = {};
        if (sort === 'price-low') {
            sortOptions['variants.500ml.price'] = 1;
        } else if (sort === 'price-high') {
            sortOptions['variants.500ml.price'] = -1;
        } else if (sort === 'name-asc') {
            sortOptions.name = 1;
        } else if (sort === 'name-desc') {
            sortOptions.name = -1;
        } else {
            sortOptions.createdAt = -1;
        }

        // Price filter
        if (minPrice > 0) {
            const hasVariantProducts = await Product.countDocuments({
                'variants.500ml.price': { $exists: true }
            });
            
            if (hasVariantProducts > 0) {
                query['$or'] = [
                    { 'variants.500ml.price': { $gte: minPrice } },
                    { 'variants.650ml.price': { $gte: minPrice } }
                ];
            } else {
                query.price = { $gte: minPrice };
            }
        }

        // Get all visible products to extract unique brands
        const allProducts = await Product.find({ 
            isVisible: true
        }).populate({
            path: 'category',
            match: { isVisible: true } // Only include products with visible categories
        });
        
        // Filter out products whose category is null (category not visible)
        const filteredProducts = allProducts.filter(product => product.category !== null);
        
        const brands = [...new Set(filteredProducts.map(product => product.brand).filter(Boolean))];

        // Get total count for pagination (only count products with visible categories)
        const productsWithVisibleCategories = await Product.find(query)
            .populate({
                path: 'category',
                match: { isVisible: true }
            });
        
        const filteredProductsCount = productsWithVisibleCategories.filter(p => p.category !== null).length;
        const totalPages = Math.ceil(filteredProductsCount / limit) || 1;

        // Fetch filtered products with pagination
        const products = await Product.find(query)
            .populate({
                path: 'category',
                match: { isVisible: true }
            })
            .sort(sortOptions)
            .skip(skip)
            .limit(limit);
        
        // Filter out products whose category is null (category not visible)
        const visibleProducts = products.filter(product => product.category !== null);

        // Get all visible categories for the filter sidebar
        const categories = await Category.find({ isVisible: true });

        res.render('shop/products', {
            title: 'Our Products',
            products: visibleProducts,
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
                totalProducts: filteredProductsCount,
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
            sort: ''
        });
    }
};

// Get single product details
exports.getProductDetails = async (req, res) => {
    try {
        const productId = req.params.productId;
        
        // Fetch the product with all its details and populate category
        const product = await Product.findById(productId).populate('category');
        
        if (!product || !product.isVisible || (product.category && !product.category.isVisible)) {
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

// Update search autocomplete to only show products from visible categories
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
            isVisible: true
        })
        .populate({
            path: 'category',
            match: { isVisible: true }
        })
        .select('name images _id')
        .limit(5);
        
        // Filter out products whose category is null (category not visible)
        const visibleProducts = products.filter(product => product.category !== null);
        
        // Format the results for autocomplete
        const results = visibleProducts.map(product => ({
            id: product._id,
            value: product.name,
            label: product.name,
            image: product.images && product.images.length > 0 ? product.images[0] : null
        }));
        
        res.json(results);
    } catch (error) {
        console.error('Error in product search:', error);
        res.status(500).json([]);
    }
};

exports.getProductVariants = async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('Fetching variants for product:', productId); // Debug log
        
        const product = await Product.findById(productId);
        console.log('Found product:', product); // Debug log
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Create variants object
        const variants = {};
        
        // Log the product variants
        console.log('Product variants:', product.variants);

        // Check if variants exist and add them to the response
        if (product.variants) {
            if (product.variants['500ml']) {
                variants['500ml'] = {
                    stock: product.variants['500ml'].stock || 0,
                    price: product.variants['500ml'].price || product.price
                };
            }
            
            if (product.variants['650ml']) {
                variants['650ml'] = {
                    stock: product.variants['650ml'].stock || 0,
                    price: product.variants['650ml'].price || product.price
                };
            }
        }

        // Log the final variants object
        console.log('Sending variants:', variants);

        res.json({
            success: true,
            variants: variants,
            productName: product.name,
            basePrice: product.price
        });

    } catch (error) {
        console.error('Error fetching product variants:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product variants',
            error: error.message // Include error message for debugging
        });
    }
}; 