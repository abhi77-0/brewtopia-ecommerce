const mongoose = require('mongoose');
const Product = require('../../models/product');
const Category = require('../../models/category');
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
        .sort({ createdAt: -1 });
        
        res.render('user/products', { 
            products,
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
          
        // Render the product details page with product and similar products
        res.render('/shop/product-details', {
            product,
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

// Export all functions
module.exports = {
    getAllProductsForUser,
    getProductDetails,
    getProductsByCategory,
    searchProducts,
    filterProducts
};