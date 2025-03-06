const mongoose = require('mongoose');
const Product = require('../models/product');
const Category = require('../models/category');
const cloudinary = require('../config/cloudinary');
const { handleUpload } = require('../utils/cloudinaryUpload');
const { Readable } = require('stream');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = async (buffer, folder) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: `brewtopia/${folder}` },
            (error, result) => {
                if (error) reject(error);
                else resolve(result.secure_url);
            }
        );
        
        const bufferStream = new Readable();
        bufferStream.push(buffer);
        bufferStream.push(null);
        bufferStream.pipe(stream);
    });
};

// Get all products
exports.getAllProducts = async (req, res) => {
    try {
        const categories = await Category.find({ isDeleted: false }).sort({ name: 1 });
        const products = await Product.find({ isDeleted: false })
            .populate('category')
            .sort({ createdAt: -1 });

        res.render('admin/products', {
            title: 'Manage Products',
            products,
            categories,
            adminUser: req.session.adminUser,
            path: '/admin/products'
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('admin/products', {
            title: 'Manage Products',
            error: 'Error fetching products',
            products: [],
            categories: [],
            adminUser: req.session.adminUser,
            path: '/admin/products'
        });
    }
};

// Get single product
exports.getProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId)
            .populate('category');
        
        if (!product || product.isDeleted) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Error fetching product details' });
    }
};

// Add new product
exports.addProduct = async (req, res) => {
    try {
        const { name, description, category } = req.body;
        const variants = JSON.parse(req.body.variants);

        // Upload images to Cloudinary
        const uploadPromises = [];
        if (req.files) {
            for (let i = 1; i <= 3; i++) {
                const imageField = `image${i}`;
                if (req.files[imageField] && req.files[imageField][0]) {
                    uploadPromises.push(handleUpload(req.files[imageField][0]));
                }
            }
        }

        const uploadedImages = await Promise.all(uploadPromises);
        
        // Create product with uploaded image URLs
        const product = new Product({
            name,
            description,
            category,
            variants,
            images: {
                image1: uploadedImages[0]?.secure_url || null,
                image2: uploadedImages[1]?.secure_url || null,
                image3: uploadedImages[2]?.secure_url || null
            },
            status: 'active'
        });

        await product.save();
        res.status(201).json({ message: 'Product added successfully', product });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ error: 'Error adding product' });
    }
};

// Edit product
exports.editProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { name, description, category, brand } = req.body;
        const variants = JSON.parse(req.body.variants);

        const product = await Product.findById(productId);
        if (!product || product.isDeleted) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Update basic fields
        product.name = name;
        product.description = description;
        product.category = category;
        product.brand = brand;
        product.variants = variants;

        // Upload new images if provided
        if (req.files) {
            const newImages = {};
            for (let i = 1; i <= 3; i++) {
                const imageField = `image${i}`;
                if (req.files[imageField] && req.files[imageField][0]) {
                    try {
                        const result = await handleUpload(req.files[imageField][0]);
                        newImages[imageField] = result.secure_url;
                    } catch (uploadError) {
                        console.error(`Error uploading ${imageField}:`, uploadError);
                    }
                }
            }

            // Only update images that were uploaded
            product.images = {
                ...product.images,
                ...newImages
            };
        }

        console.log('Updating product with data:', {
            name,
            description,
            category,
            brand,
            variants
        });

        await product.save();
        res.json({ message: 'Product updated successfully', product });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: error.message || 'Error updating product' });
    }
};

// Delete product
exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId);
        
        if (!product || product.isDeleted) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Soft delete
        product.isDeleted = true;
        await product.save();

        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Error deleting product' });
    }
};

// Get product details
exports.getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        console.log('Fetching product details for:', productId);

        const product = await Product.findById(productId)
            .populate('category')
            .lean();

        if (!product) {
            console.log('Product not found');
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
            isDeleted: false
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
        const similarProducts = await Product.find({
            category: product.category,
            _id: { $ne: productId }, // exclude current product
            visibility: true // assuming you only want to show visible products
          }).limit(4); // limit to 4 similar products
          
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

// Function to get all products for users
exports.getAllProductsForUser = async (req, res) => {
    try {
        // Fetch only products that are not hidden
        const products = await Product.find({ status:'active' }); // Only fetch products that are not hidden
        res.render('user/products', { products }); // Render the user products page with the fetched products
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send('Error fetching products');
    }
}; 