import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';

async function fixCategoryNames() {
  try {
    await connectDB();
    console.log('📋 Connected to database\n');

    // Mapping of old names to new names
    const categoryMappings = {
      'Mobiles': 'Mobile',
      'Laptops': 'Laptops', // This one is correct
      'TV': 'TV',           // This one is correct
      'Tablets': 'Tablets'  // This one is correct
    };

    console.log('🔄 Fixing category names...\n');

    for (const [oldName, newName] of Object.entries(categoryMappings)) {
      if (oldName === newName) {
        console.log(`✅ ${oldName} - Already correct`);
        continue;
      }

      const category = await Category.findOne({ name: oldName });
      if (category) {
        category.name = newName;
        await category.save();
        console.log(`✅ Renamed: ${oldName} → ${newName}`);
      } else {
        console.log(`⚠️  Category not found: ${oldName}`);
      }
    }

    // Display all categories
    console.log('\n📁 Categories after fix:');
    const allCategories = await Category.find({}, 'name');
    allCategories.forEach(cat => console.log(`  - ${cat.name}`));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixCategoryNames();
