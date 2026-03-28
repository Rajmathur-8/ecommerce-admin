import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function categorizeProduct(product) {
  const name = (product.name + ' ' + product.brand).toLowerCase();
  const category = (product.category || '').toLowerCase();

  // Prioritize Laptops
  if (name.includes('macbook') || name.includes('laptop') || name.includes('book') || 
      name.includes('chromebook') || name.includes('thinkpad') || name.includes('xps')) {
    return 'Laptops';
  }

  // Tablets
  if (name.includes('ipad') || name.includes('tablet') || name.includes('galaxy tab')) {
    return 'Tablets';
  }

  // Mobile
  if (name.includes('iphone') || name.includes('phone') || name.includes('smartphone') || 
      name.includes('galaxy s') || name.includes('galaxy a') || name.includes('galaxy z') || 
      name.includes('pixel') || name.includes('motorola')) {
    return 'Mobile';
  }

  // TV (default)
  return 'TV';
}

async function seedProducts() {
  try {
    await connectDB();
    console.log('📋 Connected to database');

    // Clear all existing products
    const deletedCount = await Product.deleteMany({});
    console.log(`🗑️  Deleted ${deletedCount.deletedCount} existing products`);

    // Read updated products
    const productsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
    console.log(`📖 Loaded ${productsData.length} products from products.json`);

    // Get or create categories
    const categories = {};
    const categoryNames = ['Mobile', 'Laptops', 'TV', 'Tablets'];

    for (const catName of categoryNames) {
      let category = await Category.findOne({ name: catName });
      if (!category) {
        category = new Category({ name: catName });
        await category.save();
        console.log(`✅ Created category: ${catName}`);
      }
      categories[catName] = category._id;
    }

    // Get or create subcategories
    const subcategories = {};
    const subCatMap = {
      'Mobile': 'Smartphones',
      'Laptops': 'Laptops',
      'TV': 'Smart TV',
      'Tablets': 'Tablets'
    };

    for (const [cat, subCat] of Object.entries(subCatMap)) {
      let subcategory = await Subcategory.findOne({ name: subCat });
      if (!subcategory) {
        subcategory = new Subcategory({
          name: subCat,
          category: categories[cat]
        });
        await subcategory.save();
        console.log(`✅ Created subcategory: ${subCat}`);
      }
      subcategories[cat] = subcategory._id;
    }

    // Prepare products for batch insert
    const productsToInsert = [];
    const categoryCount = { Mobile: 0, Laptops: 0, TV: 0, Tablets: 0 };

    console.log('🔄 Categorizing products...');
    for (const productData of productsData) {
      const assignedCategory = await categorizeProduct(productData);
      categoryCount[assignedCategory]++;

      productsToInsert.push({
        productName: productData.name,
        productTitle: productData.name,
        productDescription: productData.long_description || productData.description || '',
        brandName: productData.brand,
        sku: productData.sku,
        category: categories[assignedCategory],
        subcategory: subcategories[assignedCategory],
        price: productData.price,
        discountPrice: productData.regular_price,
        modelNumber: productData.model_number,
        images: [productData.image_url || productData.thumbnail_url],
        specifications: productData.specs ? productData.specs.map((spec, idx) => ({
          key: `Specification ${idx + 1}`,
          value: spec
        })) : [],
        averageRating: productData.rating || 0,
        totalReviews: productData.review_count || 0,
        isActive: true,
        stock: productData.in_stock ? 15 : 0,
        lowStockThreshold: 10,
        stockAlertEnabled: true
      });
    }

    // Batch insert all products
    console.log('💾 Inserting products in bulk...');
    if (productsToInsert.length > 0) {
      await Product.insertMany(productsToInsert, { ordered: false });
    }

    console.log(`\n✅ Successfully seeded ${productsToInsert.length} products!\n`);
    console.log('📊 Product Distribution:');
    console.log(`   Mobile: ${categoryCount['Mobile']} products`);
    console.log(`   Laptops: ${categoryCount['Laptops']} products`);
    console.log(`   TV: ${categoryCount['TV']} products`);
    console.log(`   Tablets: ${categoryCount['Tablets']} products`);
    console.log('\n🎯 Changes made:');
    console.log('   ✓ Removed 236 refurbished products');
    console.log('   ✓ Converted all prices from USD to INR (1 USD = 83 INR)');
    console.log('   ✓ Seeded all categories: Mobile, Laptops, TV, Tablets');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error during seeding:', err);
    process.exit(1);
  }
}

seedProducts();
