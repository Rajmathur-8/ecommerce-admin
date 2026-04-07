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

        // Parse specifications from comma-separated string to array of objects
        let specifications = [];
        if (productData.specifications) {
          if (typeof productData.specifications === 'string') {
            // Convert "Display Type:LED,Resolution:Ultra HD..." to array of objects
            specifications = productData.specifications.split(',').map(spec => {
              const [key, value] = spec.split(':').map(s => s.trim());
              return key && value ? { key, value } : null;
            }).filter(Boolean);
          } else if (Array.isArray(productData.specifications)) {
            specifications = productData.specifications;
          }
        }

        // Parse frequentlyBoughtTogether from comma-separated string to array
        // NOTE: We'll skip this on initial creation since products don't exist yet
        // It can be populated later via a separate script that finds product by ID
        let frequentlyBoughtTogether = [];
        // For now, leave empty - will be handled in a separate relationship-building pass

        // Parse keyFeatures - ensure it's an array
        let keyFeatures = [];
        if (productData.keyFeatures) {
          if (typeof productData.keyFeatures === 'string') {
            keyFeatures = productData.keyFeatures.split(',').map(f => f.trim()).filter(Boolean);
          } else if (Array.isArray(productData.keyFeatures)) {
            keyFeatures = productData.keyFeatures.filter(f => f && f.trim());
          }
        }

        // Parse whatsInBox - ensure it's an array
        let whatsInBox = [];
        if (productData.whatsInBox) {
          if (typeof productData.whatsInBox === 'string') {
            whatsInBox = productData.whatsInBox.split(',').map(item => item.trim()).filter(Boolean);
          } else if (Array.isArray(productData.whatsInBox)) {
            whatsInBox = productData.whatsInBox.filter(item => item && item.trim());
          }
        }

        // Parse variants
        let variants = [];
        if (productData.variants) {
          if (typeof productData.variants === 'string') {
            try {
              variants = JSON.parse(productData.variants);
            } catch (e) {
              variants = [];
            }
          } else if (Array.isArray(productData.variants)) {
            variants = productData.variants;
          }
        }

        // Prepare product data
        const productForDB = {
          ...productData,
          category: category._id,
          subcategory: subcategory._id,
          // Map rating/reviewCount from JSON to schema field names
          averageRating: productData.rating || 0,
          totalReviews: productData.reviewCount || 0,
          // Ensure arrays are properly formatted
          images: typeof productData.images === 'string' 
            ? productData.images.split(',').map(img => img.trim()).filter(Boolean)
            : Array.isArray(productData.images) ? productData.images : [],
          youtubeVideoUrls: typeof productData.youtubeVideoUrls === 'string'
            ? productData.youtubeVideoUrls.split(',').map(url => url.trim()).filter(Boolean)
            : Array.isArray(productData.youtubeVideoUrls) ? productData.youtubeVideoUrls : [],
          productVideos: typeof productData.productVideos === 'string'
            ? productData.productVideos.split(',').map(video => video.trim()).filter(Boolean)
            : Array.isArray(productData.productVideos) ? productData.productVideos : [],
          variants: variants,
          specifications: specifications,
          keyFeatures: keyFeatures,
          whatsInBox: whatsInBox,
          frequentlyBoughtTogether: frequentlyBoughtTogether
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
