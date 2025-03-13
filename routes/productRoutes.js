const express = require('express');
const router = express.Router();
const productController = require('../controllers/user/productController');

router.get('/search', productController.searchProducts);

module.exports = router; 