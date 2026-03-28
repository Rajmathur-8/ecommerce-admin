import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Product from '../models/product.js';

async function verifyCategoryProducts() {
  try {
    await connectDB();
    console.log('📋 Connected to database\n');

    // Get all categories
    const categories = await Category.find({}, 'name _id');
    console.log('📊 Products per category:\n');

    for (const cat of categories) {
      const count = await Product.countDocuments({ category: cat._id });
      console.log(`${cat.name}: ${count} products`);
    }

    // Show sample products from Mobile category
    console.log('\n📱 Sample Mobile products:\n');
    const mobileCategory = await Category.findOne({ name: 'Mobile' });
    if (mobileCategory) {
      const samples = await Product.find({ category: mobileCategory._id })
        .select('productName brandName price discountPrice')
        .limit(5);
      samples.forEach(p => console.log(`  - ${p.productName}`));
    } else {
      console.log('  Mobile category not found!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyCategoryProducts();
