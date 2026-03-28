import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Product from '../models/product.js';

async function mergeMobileCategories() {
  try {
    await connectDB();
    console.log('📋 Connected to database\n');

    // Find all Mobile categories
    const mobileCategories = await Category.find({ name: 'Mobile' }, 'name _id');
    console.log(`Found ${mobileCategories.length} "Mobile" categories\n`);

    if (mobileCategories.length < 2) {
      console.log('✅ Only one Mobile category exists - no merge needed');
      process.exit(0);
    }

    // Keep the first one, merge all products to it
    const primaryCategory = mobileCategories[0];
    const otherCategories = mobileCategories.slice(1);

    console.log(`🔄 Merging ${otherCategories.length} duplicate categories...\n`);

    for (const otherCategory of otherCategories) {
      // Update all products with this category to use primary category
      const productsWithOtherCategory = await Product.find({ category: otherCategory._id });
      console.log(`  Updating ${productsWithOtherCategory.length} products from ${otherCategory._id}`);
      
      if (productsWithOtherCategory.length > 0) {
        await Product.updateMany(
          { category: otherCategory._id },
          { category: primaryCategory._id }
        );
      }

      // Delete the duplicate category
      await Category.deleteOne({ _id: otherCategory._id });
      console.log(`  ✅ Deleted duplicate category: ${otherCategory._id}`);
    }

    // Verify final state
    console.log('\n✅ Merge completed!\n');
    
    console.log('📊 Final category count:\n');
    const mobileCheck = await Category.find({ name: 'Mobile' }, 'name _id');
    console.log(`Mobile categories: ${mobileCheck.length}`);

    const finalProductCount = await Product.countDocuments({ category: mobileCheck[0]._id });
    console.log(`Total products in Mobile: ${finalProductCount}`);

    console.log('\n📱 Sample Mobile products:\n');
    const samples = await Product.find({ category: mobileCheck[0]._id })
      .select('productName')
      .limit(5);
    samples.forEach(p => console.log(`  - ${p.productName}`));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

mergeMobileCategories();
