const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// Helper function to handle file upload to Cloudinary
exports.handleUpload = async (file) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { 
                folder: 'brewtopia/products',
                resource_type: 'auto'
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        // Create a readable stream from the file buffer
        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);
        
        // Pipe the buffer to Cloudinary
        bufferStream.pipe(stream);
    });
}; 