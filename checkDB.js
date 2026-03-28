import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const check = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';
    console.log('Connecting to:', uri);
    
    await mongoose.connect(uri, { 
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000 
    });
    
    const db = mongoose.connection.db;
    const collection = db.collection('products');
    const count = await collection.countDocuments();
    console.log('Total products:', count);
    
    if (count > 0) {
      const firstProduct = await collection.findOne();
      console.log('\nFirst product:');
      console.log('Name:', firstProduct.productName);
      console.log('Images count:', firstProduct.images?.length || 0);
      console.log('Images:', firstProduct.images);
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

check();
