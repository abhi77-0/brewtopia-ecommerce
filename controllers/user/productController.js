const mongoose = require('mongoose');
const Product = require('../../models/product');
const Category = require('../../models/Category');
const { Readable } = require('stream');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Function to get all products for users
const getAllProductsForUser = async (req, res) => {
    try {
        // Fetch only products that are not hidden and active
        const products = await Product.find({ 
            status: 'active',
            isVisible: true,
            isDeleted: false
        })
        .populate('category')
        .populate('offer')
        .populate('categoryOffer')
        .sort({ createdAt: -1 });
        
        // Calculate best offer for each product
        const productsWithOffers = products.map(product => {
            const offerInfo = calculateBestOffer(product);
            return {
                ...product._doc,
                bestOffer: offerInfo.bestOffer,
                discountAmount: offerInfo.discountAmount,
                discountPercentage: offerInfo.discountPercentage,
                finalPrice: offerInfo.finalPrice
            };
        });
        
        res.render('user/products', { 
            products: productsWithOffers,
            title: 'Our Products'
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('error', {
            message: 'Error loading products',
            error: error.message
        });
    }
};

// Get product details for user view
const getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('Fetching product details for:', productId);

        const product = await Product.findById(productId)
            .populate('category')
            .populate('offer')
            .populate('categoryOffer')
            .lean();

        if (!product || product.isDeleted || !product.isVisible) {
            console.log('Product not found or not visible');
            return res.status(404).render('error', {
                message: 'Product not found'
            });
        }

        console.log('Found product:', {
            id: product._id,
            name: product.name,
            category: product.category?._id,
            brand: product.brand
        });

        // Build query for similar products
        const similarProductsQuery = {
            _id: { $ne: productId },  // Exclude current product
            isDeleted: false,
            isVisible: true,
            status: 'active'
        };

        // Add category or brand condition if they exist
        if (product.category?._id || product.brand) {
            similarProductsQuery.$or = [];
            
            if (product.category?._id) {
                similarProductsQuery.$or.push({ category: product.category._id });
            }
            
            if (product.brand) {
                similarProductsQuery.$or.push({ brand: product.brand });
            }
        }

        console.log('Similar products query:', JSON.stringify(similarProductsQuery, null, 2));

        // Find similar products
        const similarProducts = await Product.find(similarProductsQuery)
            .populate('category')
            .limit(4); 
          
        const offerInfo = calculateBestOffer(product);
        const productWithOffer = {
            ...product,
            bestOffer: offerInfo.bestOffer,
            discountAmount: offerInfo.discountAmount,
            discountPercentage: offerInfo.discountPercentage,
            finalPrice: offerInfo.finalPrice
        };

        // Render the product details page with product and similar products
        res.render('/shop/product-details', {
            product: productWithOffer,
            similarProducts,
            title: product.name
        });

    } catch (error) {
        console.error('Error in getProductDetails:', error);
        res.status(500).render('error', {
            message: 'Error loading product details',
            error: error.message
        });
    }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        
        // Verify the category exists
        const category = await Category.findById(categoryId);
        if (!category || category.isDeleted) {
            return res.status(404).render('error', {
                message: 'Category not found'
            });
        }
        
        // Find products in this category that are visible
        const products = await Product.find({
            category: categoryId,
            isVisible: true,
            isDeleted: false,
            status: 'active'
        }).populate('category');
        
        res.render('user/category-products', {
            category,
            products,
            title: `${category.name} Products`
        });
    } catch (error) {
        console.error('Error fetching category products:', error);
        res.status(500).render('error', {
            message: 'Error loading category products',
            error: error.message
        });
    }
};

// Search products
const searchProducts = async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        if (!searchTerm) {
            return res.json([]);
        }

        // Find products where the name starts with the search term (case-insensitive)
        const products = await Product.find({
            name: { $regex: `^${searchTerm}`, $options: 'i' }
        }).select('name images').limit(5); // Limit results for performance

        res.json(products);
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Filter products by price range
const filterProducts = async (req, res) => {
    try {
        const { minPrice, maxPrice, category, brand } = req.query;
        
        // Build filter query
        const filterQuery = {
            isVisible: true,
            isDeleted: false,
            status: 'active'
        };
        
        // Add price range if provided
        if (minPrice !== undefined && maxPrice !== undefined) {
            filterQuery['variants.price'] = { 
                $gte: parseFloat(minPrice), 
                $lte: parseFloat(maxPrice) 
            };
        }
        
        // Add category filter if provided
        if (category) {
            filterQuery.category = category;
        }
        
        // Add brand filter if provided
        if (brand) {
            filterQuery.brand = brand;
        }
        
        // Get filtered products
        const products = await Product.find(filterQuery).populate('category');
        
        // For AJAX requests, return JSON
        if (req.xhr) {
            return res.json({ products });
        }
        
        // For regular requests, render the filtered products page
        res.render('user/filtered-products', {
            products,
            filters: {
                minPrice,
                maxPrice,
                category,
                brand
            },
            title: 'Filtered Products'
        });
    } catch (error) {
        console.error('Error filtering products:', error);
        
        if (req.xhr) {
            return res.status(500).json({ error: 'Error filtering products' });
        }
        
        res.status(500).render('error', {
            message: 'Error filtering products',
            error: error.message
        });
    }
};

// Add this helper function to calculate the best offer for a product
const calculateBestOffer = (product) => {
    let bestOffer = null;
    let discountAmount = 0;
    let discountPercentage = 0;
    
    // Check product-specific offer
    if (product.offer && product.offer.isActive) {
        const offerDiscount = product.offer.discountType === 'percentage' 
            ? (product.variants[0].price * product.offer.discountAmount / 100)
            : product.offer.discountAmount;
            
        if (offerDiscount > discountAmount) {
            discountAmount = offerDiscount;
            bestOffer = product.offer;
            discountPercentage = product.offer.discountType === 'percentage'
                ? product.offer.discountAmount
                : Math.round((offerDiscount / product.variants[0].price) * 100);
        }
    }
    
    // Check category offer
    if (product.categoryOffer && product.categoryOffer.isActive) {
        const categoryDiscount = product.categoryOffer.discountType === 'percentage'
            ? (product.variants[0].price * product.categoryOffer.discountAmount / 100)
            : product.categoryOffer.discountAmount;
            
        if (categoryDiscount > discountAmount) {
            discountAmount = categoryDiscount;
            bestOffer = product.categoryOffer;
            discountPercentage = product.categoryOffer.discountType === 'percentage'
                ? product.categoryOffer.discountAmount
                : Math.round((categoryDiscount / product.variants[0].price) * 100);
        }
    }
    
    return {
        bestOffer,
        discountAmount,
        discountPercentage,
        finalPrice: product.variants[0].price - discountAmount
    };
};

// Export all functions
module.exports = {
    getAllProductsForUser,
    getProductDetails,
    getProductsByCategory,
    searchProducts,
    filterProducts
};