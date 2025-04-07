require('dotenv').config();
const User = require('../../models/userModel');
const Product = require('../../models/product');
const { handleUpload } = require('../../utils/cloudinaryUpload');
const Category = require('../../models/category');

// Admin authentication controllers
const getLoginPage = (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { 
        error: req.query.error,
        title: 'Admin Login',
        path: '/admin/login'
    });
};

const adminLogin = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        console.log('Login attempt for:', email);
        
        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            // Set admin session
            req.session.isAdmin = true;
            req.session.adminUser = {
                email: email,
                name: process.env.ADMIN_NAME || 'Admin',
                role: 'admin'
            };
            
            // Save session before redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.render('admin/login', { 
                        error: 'Login failed, please try again',
                        title: 'Admin Login',
                        path: '/admin/login'
                    });
                }
                console.log('Admin login successful:', email);
                res.redirect('/admin/dashboard');
            });
        } else {
            console.log('Invalid credentials');
            res.render('admin/login', { 
                error: 'Invalid credentials',
                title: 'Admin Login',
                path: '/admin/login'
            });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.render('admin/login', {
            error: 'Login failed, please try again',
            title: 'Admin Login',
            path: '/admin/login'
        });
    }
};

const adminLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/admin/login');
    });
};

// Dashboard controllers
const getDashboardStats = async () => {
    try {
        const totalProducts = await Product.countDocuments();
        const totalUsers = await User.countDocuments();
        // You would need to add Order model and related logic here
        
        return {
            totalProducts,
            newOrders: 0, // Replace with actual logic when Order model is available
            totalUsers,
            totalRevenue: 0 // Replace with actual logic when Order model is available
        };
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        return {
            totalProducts: 0,
            newOrders: 0,
            totalUsers: 0,
            totalRevenue: 0
        };
    }
};

const getDashboard = async (req, res) => {
    try {
        const stats = await getDashboardStats();
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            adminUser: req.session.adminUser,
            path: '/admin/dashboard',
            stats
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('admin/login', {
            error: 'Error loading dashboard',
            title: 'Admin Login',
            path: '/admin/login'
        });
    }
};

// User management controllers
const getUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.render('admin/users', {
            title: 'Manage Users',
            adminUser: req.session.adminUser,
            path: '/admin/users',
            users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).render('admin/users', {
            title: 'Manage Users',
            adminUser: req.session.adminUser,
            path: '/admin/users',
            users: []
        });
    }
};

const toggleUserBlockStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.blocked = !user.blocked;
        await user.save();

        // If the user is being blocked, invalidate their session
        if (user.blocked) {
            // Add the user to a blockedUsers array in the app
            if (!global.blockedUsers) {
                global.blockedUsers = [];
            }
            
            // Store the user ID in the global blockedUsers array
            if (!global.blockedUsers.includes(userId)) {
                global.blockedUsers.push(userId);
            }
        } else {
            // If unblocking, remove from the blockedUsers array
            if (global.blockedUsers && global.blockedUsers.includes(userId)) {
                global.blockedUsers = global.blockedUsers.filter(id => id !== userId);
            }
        }

        res.json({ message: `User has been ${user.blocked ? 'blocked' : 'unblocked'}` });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
};

// Admin Product management controllers
const getAdminProducts = async (req, res) => {
    try {
        console.log('=== ADMIN PRODUCTS LISTING ===');
        
        // Get all products without any filters
        const allProducts = await Product.find();
        console.log(`Total products in database: ${allProducts.length}`);
        
        // Get categories
        const categories = await Category.find().sort({ name: 1 });
        
        // Filter products in memory if needed
        const products = allProducts.filter(product => {
            // Only filter by isVisible if you want to show all products in admin
            // return product.isVisible !== false;
            return true; // Show all products in admin
        });
        
        console.log(`Filtered products for display: ${products.length}`);
        
        if (products.length > 0) {
            console.log('First product:', {
                id: products[0]._id,
                name: products[0].name,
                isVisible: products[0].isVisible
            });
        } else {
            console.log('No products to display');
        }

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
            error: 'Error fetching products: ' + error.message,
            products: [],
            categories: [],
            adminUser: req.session.adminUser,
            path: '/admin/products'
        });
    }
};

const getAdminProductDetail = async (req, res) => {
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

// Add Product with validation
const addProduct = async (req, res) => {
    try {
        const { name, description, category, brand } = req.body;
        
        // Validation
        if (!name || !description || !category || !brand) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }
        
        // Validate variants
        let variants;
        try {
            variants = JSON.parse(req.body.variants);
            
            // Check if variants have valid price and stock
            for (const size in variants) {
                const variant = variants[size];
                if (!variant.price || isNaN(parseFloat(variant.price)) || parseFloat(variant.price) <= 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `Invalid price for ${size} variant` 
                    });
                }
                
                if (!variant.stock || isNaN(parseInt(variant.stock)) || parseInt(variant.stock) < 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `Invalid stock for ${size} variant` 
                    });
                }
                
                // Convert to numbers
                variant.price = parseFloat(variant.price);
                variant.stock = parseInt(variant.stock);
                
                // Add MRP field if not present (for discount calculation)
                if (!variant.mrp || variant.mrp <= 0) {
                    variant.mrp = variant.price;
                }
            }
        } catch (e) {
            console.error('Variants parsing error:', e);
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid variants data' 
            });
        }

        // Check if at least one image is provided
        if (!req.files || !req.files.image1) {
            return res.status(400).json({ 
                success: false, 
                error: 'At least one product image is required' 
            });
        }

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
            brand,
            category,
            variants,
            images: {
                image1: uploadedImages[0]?.secure_url || null,
                image2: uploadedImages[1]?.secure_url || null,
                image3: uploadedImages[2]?.secure_url || null
            },
            status: 'active',
            isVisible: true
        });

        await product.save();
        res.status(201).json({ 
            success: true,
            message: 'Product added successfully', 
            product 
        });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error adding product: ' + error.message 
        });
    }
};

// Edit Product with validation
const editProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { name, description, category, brand } = req.body;
        
        // Validation
        if (!name || !description || !category || !brand) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }
        
        // Find product
        const product = await Product.findById(productId);
        if (!product || product.isDeleted) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }

        // Parse variants
        let variants;
        try {
            variants = JSON.parse(req.body.variants);
            
            // Check if variants have valid price and stock
            for (const size in variants) {
                const variant = variants[size];
                if (!variant.price || isNaN(parseFloat(variant.price)) || parseFloat(variant.price) <= 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `Invalid price for ${size} variant` 
                    });
                }
                
                if (variant.stock === undefined || isNaN(parseInt(variant.stock)) || parseInt(variant.stock) < 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `Invalid stock for ${size} variant` 
                    });
                }
                
                // Convert to numbers
                variant.price = parseFloat(variant.price);
                variant.stock = parseInt(variant.stock);
                
                // Add MRP field if not present (for discount calculation)
                if (!variant.mrp || variant.mrp <= 0) {
                    variant.mrp = variant.price;
                }
            }
        } catch (e) {
            console.error('Variants parsing error:', e);
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid variants data' 
            });
        }

        // Update basic fields
        product.name = name;
        product.description = description;
        product.category = category;
        product.brand = brand;
        product.variants = variants;

        // Handle image uploads
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

            // Update images
            product.images = {
                ...product.images,
                ...newImages
            };
        }

        await product.save();
        return res.status(200).json({ 
            success: true,
            message: 'Product updated successfully',
            product: product
        });

    } catch (error) {
        console.error('Error in editProduct:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to update product: ' + error.message 
        });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.productId;
        console.log(`Attempting to delete product with ID: ${productId}`);
        
        // Find the product
        const product = await Product.findById(productId);
        
        if (!product) {
            console.log(`Product not found with ID: ${productId}`);
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }
        
        // Perform hard delete - completely remove from database
        await Product.findByIdAndDelete(productId);
        
        console.log(`Product successfully deleted from database: ${productId}`);

        return res.status(200).json({ 
            success: true, 
            message: `Product "${product.name}" has been permanently deleted` 
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to delete product: ' + error.message 
        });
    }
};

const toggleProductVisibility = async (req, res) => {
    try {
        const productId = req.params.id;
        
        // Find the product
        const product = await Product.findById(productId);
        
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                error: 'Product not found' 
            });
        }
        
        // Toggle the visibility
        product.isVisible = !product.isVisible;
        
        // Save the updated product
        await product.save();
        
        // Send JSON response
        return res.status(200).json({
            success: true,
            message: `Product "${product.name}" is now ${product.isVisible ? 'visible' : 'hidden'} to customers`
        });
        
    } catch (error) {
        console.error('Error toggling product visibility:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to update product visibility' 
        });
    }
};

// Order management controllers
const getOrders = (req, res) => {
    // Replace with actual order fetching logic when Order model is available
    res.render('admin/orders', {
        title: 'Manage Orders',
        adminUser: req.session.adminUser,
        path: '/admin/orders',
        orders: []
    });
};

const updateOrderStatus = (req, res) => {
    // Implement order status update logic when Order model is available
    res.status(501).json({ message: 'Not implemented yet' });
};

module.exports = {
    // Auth controllers
    getLoginPage,
    adminLogin,
    adminLogout,
    
    // Dashboard controllers
    getDashboard,
    
    // User management controllers
    getUsers,
    toggleUserBlockStatus,
    

    // Admin Product management controllers
    getAdminProducts,
    getAdminProductDetail,
    addProduct,
    editProduct,
    deleteProduct,
    toggleProductVisibility,
    
    // Order management controllers
    getOrders,
    updateOrderStatus
};