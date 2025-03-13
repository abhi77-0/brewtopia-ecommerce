const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function debugDatabase() {
  try {
    console.log('=== DATABASE DEBUG ===');
    
    // 1. List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections in database:');
    collections.forEach(collection => {
      console.log(`- ${collection.name}`);
    });
    
    // 2. Check products collection directly (case insensitive)
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
    
    // 3. Query products directly from the collection
    const rawProducts = await mongoose.connection.db.collection(productsCollection).find({}).toArray();
    console.log(`Raw products in collection: ${rawProducts.length}`);
    
    if (rawProducts.length > 0) {
      console.log('First raw product:');
      console.log(JSON.stringify(rawProducts[0], null, 2));
    }
    
    // 4. Check if Product model is correctly connected
    const Product = mongoose.model('Product');
    console.log('Product model collection:', Product.collection.name);
    
    // 5. Query using the model
    const modelProducts = await Product.find();
    console.log(`Products via model: ${modelProducts.length}`);
    
    if (modelProducts.length > 0) {
      console.log('First product via model:');
      console.log(JSON.stringify(modelProducts[0].toObject(), null, 2));
    }
    
    // 6. Check for specific fields that might be causing issues
    if (rawProducts.length > 0) {
      const firstProduct = rawProducts[0];
      console.log('Field check:');
      console.log(`- _id: ${firstProduct._id}`);
      console.log(`- name: ${firstProduct.name}`);
      console.log(`- isVisible: ${firstProduct.isVisible}`);
      console.log(`- isDeleted: ${firstProduct.isDeleted}`);
      console.log(`- variants type: ${typeof firstProduct.variants}`);
      
      // Check if variants is an object or array
      if (Array.isArray(firstProduct.variants)) {
        console.log('Variants is an Array');
      } else if (typeof firstProduct.variants === 'object') {
        console.log('Variants is an Object');
        console.log('Variant keys:', Object.keys(firstProduct.variants));
      }
    }
    
  } catch (error) {
    console.error('Error debugging database:', error);
  } finally {
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the debug function
debugDatabase(); 