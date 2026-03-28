import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seedBulkProducts() {
  try {
    await connectDB();
    console.log('📋 Connected to database');

    // Read the bulk seed data
    const dataPath = path.join(__dirname, 'bulkSeedData.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const productsData = JSON.parse(rawData);

    console.log(`\n📦 Processing ${productsData.length} products...\n`);

    let createdCount = 0;
    let errorCount = 0;

    for (const productData of productsData) {
      try {
        // Get or create category
        let category = await Category.findOne({ name: productData.category });
        if (!category) {
          category = new Category({
            name: productData.category,
            description: `${productData.category} products`,
            status: 'Active'
          });
          await category.save();
          console.log(`✅ Created category: ${productData.category}`);
        }

        // Get or create subcategory
        let subcategory = await Subcategory.findOne({ name: productData.subcategory });
        if (!subcategory) {
          subcategory = new Subcategory({
            name: productData.subcategory,
            category: category._id,
            status: 'Active'
          });
          await subcategory.save();
          console.log(`✅ Created subcategory: ${productData.subcategory}`);
        }

        // Prepare product data
        const productForDB = {
          ...productData,
          category: category._id,
          subcategory: subcategory._id,
          // Ensure arrays are properly formatted
          images: Array.isArray(productData.images) ? productData.images : [productData.images].filter(Boolean),
          youtubeVideoUrls: Array.isArray(productData.youtubeVideoUrls) ? productData.youtubeVideoUrls : [productData.youtubeVideoUrls].filter(Boolean),
          productVideos: Array.isArray(productData.productVideos) ? productData.productVideos : [],
          variants: Array.isArray(productData.variants) ? productData.variants : [],
          specifications: Array.isArray(productData.specifications) ? productData.specifications : [],
          frequentlyBoughtTogether: Array.isArray(productData.frequentlyBoughtTogether) ? productData.frequentlyBoughtTogether : []
        };

        // Create product
        const product = new Product(productForDB);
        await product.save();

        console.log(`✅ Created product: ${productData.productName} (SKU: ${productData.sku})`);
        createdCount++;
      } catch (error) {
        console.error(`❌ Error creating product ${productData.productName}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Seeding completed!`);
    console.log(`📊 Created: ${createdCount} products`);
    if (errorCount > 0) {
      console.log(`⚠️  Errors: ${errorCount} products`);
    }

    // Verify products were created
    const verifyCount = await Product.countDocuments();
    console.log(`\n✅ Verification: ${verifyCount} products in database`);

    // Wait a moment before exiting to ensure all data is committed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding products:', err.message);
    process.exit(1);
  }
}

seedBulkProducts();
