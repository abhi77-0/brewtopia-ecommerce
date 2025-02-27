const { MongoClient } = require("mongodb");
require("dotenv").config();

let db;

const connectDB = async () => {
    try {
        const client = new MongoClient(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        db = client.db("brewtopia"); // Replace with your database name
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection error:", error);
        throw new Error("DB not initialized");
    }
};

const getDB = () => {
    if (!db) throw new Error("DB not initialized");
    return db;
};

module.exports = { connectDB, getDB };
