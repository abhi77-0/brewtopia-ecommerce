// const Category = require('../../models/Category');
// const Product = require('../../models/Product');

// Get all categories
exports.getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isVisible: false }).sort({ name: 1 });
        res.render('admin/categories', {
            title: 'Manage Categories',
            categories,
            adminUser: req.session.adminUser,
            path: '/admin/categories'
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).render('admin/categories', {
            title: 'Manage Categories',
            categories: [],
            error: 'Error fetching categories',
            adminUser: req.session.adminUser,
            path: '/admin/categories'
        });
    }
};

// Get single category
exports.getCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category || category.isDeleted) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ error: 'Error fetching category details' });
    }
};

