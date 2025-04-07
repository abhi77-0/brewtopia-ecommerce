const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/admin/categoryController');

// Category routes
router.get('/categories', categoryController.getCategories);
router.post('/categories/add', categoryController.addCategory);
router.get('/categories/:id', categoryController.getCategory);
router.put('/categories/edit', categoryController.updateCategory);
router.delete('/categories/:categoryId', categoryController.deleteCategory);
router.patch('/categories/:id/toggle-visibility', categoryController.toggleVisibility);

module.exports = router; 