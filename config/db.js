const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });
        
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Add connection error handler
        mongoose.connection.on('error', err => {
            console.error('MongoDB connection error:', err);
        });

        return conn.connection;
    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
};

module.exports = { connectDB };
