const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function fixProducts() {
  try {
    console.log('=== FIX PRODUCTS ===');
    
    // Find the products collection
    const collections = await mongoose.connection.db.listCollections().toArray();
    let productsCollection;
    
    for (const collection of collections) {
      if (collection.name.toLowerCase() === 'products') {
        productsCollection = collection.name;
        break;
      }
    }
    
    if (!productsCollection) {
      console.log('No products collection found!');
      return;
    }
    
    console.log(`Found products collection: ${productsCollection}`);
    
    // Get all products
    const products = await mongoose.connection.db.collection(productsCollection).find({}).toArray();
    console.log(`Found ${products.length} products to fix`);
    
    // Fix each product
    for (const product of products) {
      console.log(`Fixing product: ${product.name}`);
      
      const updates = {};
      
      // Ensure isVisible is set to true
      if (product.isVisible === undefined) {
        updates.isVisible = true;
        console.log('- Added isVisible: true');
      }
      
      // Remove isDeleted if it exists
      if (product.isDeleted !== undefined) {
        await mongoose.connection.db.collection(productsCollection).updateOne(
          { _id: product._id },
          { $unset: { isDeleted: "" } }
        );
        console.log('- Removed isDeleted field');
      }
      
      // Apply updates if needed
      if (Object.keys(updates).length > 0) {
        await mongoose.connection.db.collection(productsCollection).updateOne(
          { _id: product._id },
          { $set: updates }
        );
        console.log('- Applied updates');
      }
    }
    
    console.log('All products fixed!');
    
  } catch (error) {
    console.error('Error fixing products:', error);
  } finally {
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the fix function
fixProducts(); 