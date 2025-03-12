const Category = require('../../models/category');
const Product = require('../../models/product');

// Get all categories
exports.getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find({ isDeleted: false }).sort({ name: 1 });
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

// Add new category
exports.addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        // Check if category with same name exists
        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            isDeleted: false 
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Category with this name already exists' });
        }

        const category = new Category({
            name,
            description
        });

        await category.save();
        res.status(201).json({ message: 'Category added successfully', category });
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ error: 'Error adding category' });
    }
};

// Update category
exports.updateCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { name, description } = req.body;

        const category = await Category.findById(categoryId);
        
        if (!category || category.isDeleted) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Check if another category with same name exists
        const existingCategory = await Category.findOne({
            _id: { $ne: categoryId },
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            isDeleted: false
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Another category with this name already exists' });
        }

        category.name = name;
        category.description = description;

        await category.save();
        res.json({ message: 'Category updated successfully', category });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'Error updating category' });
    }
};

// Delete category
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.categoryId);
        
        if (!category || category.isDeleted) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Check if category is being used by any products
        const productsUsingCategory = await Product.find({ 
            category: req.params.categoryId,
            isDeleted: false
        });

        if (productsUsingCategory.length > 0) {
            return res.status(400).json({ 
                error: 'Cannot delete category as it is being used by products. Remove or reassign products first.' 
            });
        }

        // Soft delete
        category.isDeleted = true;
        await category.save();

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'Error deleting category' });
    }
}; 