import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from './db/mongo-db-connect.js';
import Product from './models/product.js';
import Category from './models/category.js';
import Subcategory from './models/subcategory.js';

async function verify() {
  try {
    await connectDB();
    
    const productCount = await Product.countDocuments();
    const categoryCount = await Category.countDocuments();
    const subcategoryCount = await Subcategory.countDocuments();
    
    const categories = await Category.find({}, 'name').limit(10);
    const sampleProducts = await Product.find({}, 'productName category subcategory price').limit(5);
    
    console.log('\n📊 SEEDING VERIFICATION REPORT');
    console.log('================================\n');
    console.log(`✅ Total Products: ${productCount}`);
    console.log(`✅ Total Categories: ${categoryCount}`);
    console.log(`✅ Total Subcategories: ${subcategoryCount}`);
    console.log('\n📋 Sample Categories:');
    categories.forEach(cat => console.log(`   - ${cat.name}`));
    
    console.log('\n📦 Sample Products:');
    for (const product of sampleProducts) {
      console.log(`   - ${product.productName} (₹${product.price})`);
    }
    
    console.log('\n✅ Seeding Verification Complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verify();
