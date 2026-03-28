import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Product from '../models/product.js';

async function fixDuplicateCategories() {
  try {
    await connectDB();
    console.log('🔍 Checking for duplicate categories...\n');

    // Find all categories
    const allCategories = await Category.find({}, 'name _id');
    console.log('📊 Current categories:');
    allCategories.forEach(cat => console.log(`  - ${cat.name} (${cat._id})`));

    // Check for Mobile/Mobiles duplicates
    const mobileCategory = await Category.findOne({ name: 'Mobile' });
    const mobilesCategory = await Category.findOne({ name: 'Mobiles' });

    if (mobileCategory && mobilesCategory) {
      console.log('\n⚠️  Found duplicate Mobile categories!');
      console.log(`  Mobile: ${mobileCategory._id}`);
      console.log(`  Mobiles: ${mobilesCategory._id}`);

      // Count products in each
      const mobileCount = await Product.countDocuments({ category: mobileCategory._id });
      const mobilesCount = await Product.countDocuments({ category: mobilesCategory._id });

      console.log(`\n  Mobile products: ${mobileCount}`);
      console.log(`  Mobiles products: ${mobilesCount}`);

      // Move all products from "Mobiles" to "Mobile"
      if (mobilesCount > 0) {
        console.log('\n🔄 Moving products from "Mobiles" to "Mobile"...');
        const result = await Product.updateMany(
          { category: mobilesCategory._id },
          { category: mobileCategory._id }
        );
        console.log(`✅ Updated ${result.modifiedCount} products`);
      }

      // Delete the "Mobiles" category
      console.log('\n🗑️  Deleting "Mobiles" category...');
      await Category.deleteOne({ _id: mobilesCategory._id });
      console.log('✅ Deleted "Mobiles" category');
    } else if (!mobileCategory && mobilesCategory) {
      console.log('\n⚠️  Only "Mobiles" exists, renaming to "Mobile"...');
      await Category.updateOne(
        { _id: mobilesCategory._id },
        { name: 'Mobile' }
      );
      console.log('✅ Renamed "Mobiles" to "Mobile"');
    } else if (mobileCategory && !mobilesCategory) {
      console.log('\n✅ Only "Mobile" exists, no duplicates found');
    } else {
      console.log('\n❌ No Mobile category found!');
    }

    // Check for other duplicates (Laptops/Laptop, Tablets/Tablet, TV/TVs)
    const duplicateChecks = [
      { singular: 'Laptops', plural: 'Laptop' },
      { singular: 'Tablets', plural: 'Tablet' },
      { singular: 'TV', plural: 'TVs' }
    ];

    console.log('\n\n🔍 Checking for other category duplicates...\n');
    for (const check of duplicateChecks) {
      const singular = await Category.findOne({ name: check.singular });
      const plural = await Category.findOne({ name: check.plural });

      if (singular && plural) {
        console.log(`⚠️  Found duplicate: "${check.singular}" and "${check.plural}"`);
        const singularCount = await Product.countDocuments({ category: singular._id });
        const pluralCount = await Product.countDocuments({ category: plural._id });

        console.log(`  ${check.singular}: ${singularCount} products`);
        console.log(`  ${check.plural}: ${pluralCount} products`);

        // Keep singular form, move products from plural to singular
        if (pluralCount > 0) {
          await Product.updateMany(
            { category: plural._id },
            { category: singular._id }
          );
          console.log(`✅ Moved ${pluralCount} products to "${check.singular}"`);
        }

        await Category.deleteOne({ _id: plural._id });
        console.log(`✅ Deleted "${check.plural}" category\n`);
      }
    }

    // Final verification
    console.log('\n✅ Final category list:');
    const finalCategories = await Category.find({}, 'name');
    finalCategories.forEach(cat => console.log(`  - ${cat.name}`));

    console.log('\n✅ Category consolidation complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixDuplicateCategories();
