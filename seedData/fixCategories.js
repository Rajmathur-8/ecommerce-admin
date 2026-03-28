import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

export const fixCategories = async () => {
  try {
    console.log('🔧 Starting category consolidation...\n');

    // Get all categories with product counts
    const allCategories = await Category.find();
    console.log('📊 Current categories in database:\n');
    
    const categoryMap = {};
    for (const cat of allCategories) {
      const count = await Product.countDocuments({ category: cat._id });
      console.log(`${cat.name}: ${count} products`);
      categoryMap[cat.name.toLowerCase()] = { doc: cat, count };
    }

    console.log('\n🔄 Fixing category inconsistencies...\n');

    // Define the correct categories
    const correctCategories = ['TV', 'Laptops', 'Mobile', 'Tablets'];
    const categoryMappings = {
      'mobiles': 'Mobile',
      'mobile': 'Mobile',
      'laptop': 'Laptops',
      'laptops': 'Laptops',
      'tv': 'TV',
      'tvs': 'TV',
      'tablet': 'Tablets',
      'tablets': 'Tablets'
    };

    // Consolidate products from incorrect category names
    for (const [wrongName, correctName] of Object.entries(categoryMappings)) {
      if (wrongName === correctName.toLowerCase()) continue;

      const wrongCat = allCategories.find(c => c.name.toLowerCase() === wrongName);
      const correctCat = allCategories.find(c => c.name === correctName);

      if (wrongCat && correctCat) {
        const productsToMove = await Product.find({ category: wrongCat._id });
        
        if (productsToMove.length > 0) {
          console.log(`Moving ${productsToMove.length} products from "${wrongCat.name}" to "${correctCat.name}"`);
          
          // Get or create the correct subcategory
          let correctSubcat = await Subcategory.findOne({
            name: correctName,
            category: correctCat._id
          });

          if (!correctSubcat) {
            correctSubcat = await Subcategory.create({
              name: correctName,
              category: correctCat._id,
              description: `${correctName} subcategory`,
              isActive: true
            });
          }

          // Update all products
          await Product.updateMany(
            { category: wrongCat._id },
            { 
              category: correctCat._id,
              subcategory: correctSubcat._id
            }
          );

          console.log(`✅ Moved products to "${correctCat.name}"\n`);
        }
      }
    }

    // Delete duplicate/incorrect categories
    console.log('🗑️  Cleaning up duplicate categories...\n');
    for (const cat of allCategories) {
      if (!correctCategories.includes(cat.name)) {
        const productCount = await Product.countDocuments({ category: cat._id });
        if (productCount === 0) {
          await Category.deleteOne({ _id: cat._id });
          await Subcategory.deleteMany({ category: cat._id });
          console.log(`✅ Deleted empty category: ${cat.name}`);
        }
      }
    }

    // Verify final state
    console.log('\n📊 Final category structure:\n');
    const finalCategories = await Category.find();
    
    for (const cat of finalCategories) {
      const count = await Product.countDocuments({ category: cat._id });
      const subCats = await Subcategory.find({ category: cat._id });
      
      console.log(`${cat.name}: ${count} products`);
      subCats.forEach(sub => console.log(`  └─ ${sub.name}`));
    }

    console.log('\n✅ Category consolidation completed!');
  } catch (error) {
    console.error('❌ Error fixing categories:', error.message);
    throw error;
  }
};

// Run if called directly
const args = process.argv.slice(2);
if (args[0] === 'fix') {
  connectDB().then(async () => {
    await fixCategories();
    process.exit(0);
  }).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
}

export default fixCategories;
