import { connectDB } from '../db/mongo-db-connect.js';
import Product from '../models/product.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';

export const clearAllProducts = async () => {
  try {
    console.log('🗑️  Clearing all products...\n');
    
    const result = await Product.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} products\n`);

    // Also clear subcategories to recreate them properly
    const subResult = await Subcategory.deleteMany({});
    console.log(`✅ Cleared ${subResult.deletedCount} subcategories\n`);

    // Keep only the main categories but delete others
    const mainCategories = ['TV', 'Laptops', 'Mobile', 'Tablets'];
    const toDelete = await Category.find({ name: { $nin: mainCategories } });
    
    for (const cat of toDelete) {
      await Category.deleteOne({ _id: cat._id });
      console.log(`✅ Deleted category: ${cat.name}`);
    }

    console.log('\n✅ Database cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing products:', error.message);
    throw error;
  }
};

// Run if called directly
const args = process.argv.slice(2);
if (args[0] === 'clear') {
  connectDB().then(async () => {
    await clearAllProducts();
    process.exit(0);
  }).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
}

export default clearAllProducts;
