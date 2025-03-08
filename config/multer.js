// config/multer.js
const multer = require('multer');

/**
 * Multer configuration for handling image uploads
 * Uses memory storage for processing images before saving
 */
const storage = multer.memoryStorage();

const imageUpload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Define common upload configurations
const productImageUpload = imageUpload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 }
]);

module.exports = {
    imageUpload,
    productImageUpload
};