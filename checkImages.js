import mongoose from 'mongoose';
import Product from './models/product.js';
import dotenv from 'dotenv';

dotenv.config();

const checkProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce');
    
    const products = await Product.find({}).limit(10).lean();
    
    console.log('✅ Found', products.length, 'products');
    console.log('\n=== Product Images Check ===\n');
    
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.productName}`);
      console.log(`   Images count: ${product.images?.length || 0}`);
      if (product.images && product.images.length > 0) {
        console.log(`   First image: ${product.images[0]}`);
      } else {
        console.log(`   ⚠️  No images found!`);
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
};

checkProducts();
