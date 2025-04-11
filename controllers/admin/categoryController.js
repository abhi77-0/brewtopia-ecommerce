const Category = require('../../models/category');
const Product = require('../../models/product');

// Category management controllers
exports.getCategories = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6; 
        const skip = (page - 1) * limit;
        
        // Get total count for pagination
        const totalCategories = await Category.countDocuments({});
        const totalPages = Math.ceil(totalCategories / limit);
        
        // Get paginated categories
        const categories = await Category.find({})
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();

        // Populate product counts
        const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
            const productCount = await Product.countDocuments({ 
                category: category._id
            });
            return {
                ...category,
                productCount
            };
        }));

        res.render('admin/categories', {
            title: 'Manage Categories',
            adminUser: req.session.adminUser,
            path: '/admin/categories',
            categories: categoriesWithCounts,
            pagination: {
                page,
                limit,
                totalCategories,
                totalPages
            }
        });
    } catch (error) {
        console.error('Error in getCategories:', error);
        res.status(500).render('admin/categories', {
            title: 'Manage Categories',
            adminUser: req.session.adminUser,
            path: '/admin/categories',
            categories: [],
            pagination: {
                page: 1,
                limit: 6,
                totalCategories: 0,
                totalPages: 0
            }
        });
    }
};

// Get single category
exports.getCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ error: 'Error fetching category details' });
    }
};

// Add new category
exports.addCategory = async (req, res) => {
    try {
        const { name } = req.body;

        // Check if category with same name exists
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Category with this name already exists' });
        }

        const category = new Category({
            name,
            isVisible: true
        });

        const savedCategory = await category.save();
        res.status(201).json({ message: 'Category added successfully', category: savedCategory });
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ error: 'Error adding category' });
    }
};

// Update category
exports.updateCategory = async (req, res) => {
    try {
        const { categoryId, name } = req.body;

        const category = await Category.findById(categoryId);
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Check if another category with same name exists
        const existingCategory = await Category.findOne({
            _id: { $ne: categoryId },
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Another category with this name already exists' });
        }

        category.name = name;
        await category.save();
        res.json({ message: 'Category updated successfully', category });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'Error updating category' });
    }
};

// Toggle visibility
exports.toggleVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        const { isVisible } = req.body;
        
        const category = await Category.findByIdAndUpdate(
            id,
            { isVisible },
            { new: true }
        );
        
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        res.json({ 
            success: true, 
            message: `Category ${isVisible ? 'shown' : 'hidden'} successfully` 
        });
    } catch (error) {
        console.error('Error toggling category visibility:', error);
        res.status(500).json({ error: 'Failed to update category visibility' });
    }
};

// Get active categories for product add/edit
exports.getActiveCategories = async (req, res, next) => {
    try {
        const isAdminRoute = req.path.startsWith('/admin');
        const filter = isAdminRoute 
            ? {}  // Show all categories in admin
            : { isVisible: true };  // Only visible categories for frontend

        const categories = await Category.find(filter).sort({ name: 1 });

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({
                success: true,
                categories: categories
            });
        }

        res.locals.categories = categories;
        next();
    } catch (error) {
        console.error('Error fetching active categories:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch categories'
            });
        }
        res.locals.categories = [];
        next();
    }
}; 