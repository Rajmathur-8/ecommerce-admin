import { connectDB } from '../db/mongo-db-connect.js';
import Product from '../models/product.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';

export const verifyCategorization = async () => {
  try {
    console.log('🔍 Verifying and fixing product categorization...\n');

    // Get all categories
    const categories = {};
    const allCategories = await Category.find();
    for (const cat of allCategories) {
      categories[cat.name] = cat._id;
    }

    // Fix Galaxy Book and Chromebook - should be in Laptops
    const galaxyBookPattern = /galaxy.*book|chromebook/i;
    const galaxyProducts = await Product.find({ productName: galaxyBookPattern });

    console.log(`Found ${galaxyProducts.length} Galaxy Book/Chromebook products to fix\n`);

    const laptopCategory = await Category.findOne({ name: 'Laptops' });
    const laptopSubcategory = await Subcategory.findOne({
      name: 'Laptops',
      category: laptopCategory._id
    });

    let fixedCount = 0;
    for (const product of galaxyProducts) {
      if (
        product.category.toString() !== laptopCategory._id.toString() ||
        product.subcategory.toString() !== laptopSubcategory._id.toString()
      ) {
        product.category = laptopCategory._id;
        product.subcategory = laptopSubcategory._id;
        await product.save();
        console.log(`✅ Fixed: ${product.productName}`);
        fixedCount++;
      }
    }

    console.log(`\n📊 Fixed ${fixedCount} Galaxy products\n`);

    // Count products by category
    console.log('📈 Product count by category:\n');
    const categoryStats = {};

    for (const [catName, catId] of Object.entries(categories)) {
      const count = await Product.countDocuments({ category: catId });
      categoryStats[catName] = count;
      console.log(`${catName}: ${count} products`);
    }

    // Sample products from each category
    console.log('\n📂 Sample products from each category:\n');
    for (const catName of ['TV', 'Laptops', 'Mobile', 'Tablets']) {
      const category = await Category.findOne({ name: catName });
      const samples = await Product.find({ category: category._id }).limit(3);
      console.log(`${catName}:`);
      samples.forEach(p => console.log(`  - ${p.productName}`));
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error verifying categorization:', error.message);
    throw error;
  }
};

// Run if called directly
const args = process.argv.slice(2);
if (args[0] === 'verify') {
  connectDB().then(async () => {
    await verifyCategorization();
    process.exit(0);
  }).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
}

export default verifyCategorization;
