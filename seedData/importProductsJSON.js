import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function importProductsJSON() {
  try {
    await connectDB();
    console.log('📋 Connected to database\n');

    // Read JSON file
    const jsonPath = path.join(__dirname, 'products.json');
    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    
    const products = jsonData.products;

    console.log(`📦 Processing ${products.length} products from JSON...\n`);

    let createdCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      try {
        // Skip if no product name
        if (!product.productName || !product.productName.trim()) {
          skippedCount++;
          continue;
        }

        // Check if product already exists
        const existingProduct = await Product.findOne({ sku: product.sku });
        if (existingProduct) {
          console.log(`⏭️  Skipped (already exists): ${product.productName}`);
          skippedCount++;
          continue;
        }

        // Get or create category
        let category = await Category.findOne({ name: product.category });
        if (!category) {
          category = new Category({
            name: product.category,
            description: `${product.category} products`,
            status: 'Active'
          });
          await category.save();
        }

        // Get or create subcategory
        let subcategory = await Subcategory.findOne({ name: product.subcategory });
        if (!subcategory) {
          subcategory = new Subcategory({
            name: product.subcategory,
            category: category._id,
            status: 'Active'
          });
          await subcategory.save();
        }

        // Parse images from string (comma-separated URLs)
        let images = [];
        if (product.images && typeof product.images === 'string') {
          images = product.images
            .split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0 && url.toLowerCase() !== 'nan');
        }

        // Parse variants from JSON string
        let variants = [];
        if (product.variants && typeof product.variants === 'string') {
          try {
            variants = JSON.parse(product.variants);
          } catch (e) {
            variants = [];
          }
        }

        // Parse specifications from string (key:value pairs separated by commas)
        let specifications = [];
        if (product.specifications && typeof product.specifications === 'string') {
          const specPairs = product.specifications.split(',');
          specPairs.forEach(pair => {
            const [key, value] = pair.split(':').map(s => s.trim());
            if (key && value) {
              specifications.push({ key, value });
            }
          });
        }

        // Parse YouTube URLs
        let youtubeVideoUrls = [];
        if (product.youtubeVideoUrls && typeof product.youtubeVideoUrls === 'string') {
          youtubeVideoUrls = product.youtubeVideoUrls
            .split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0);
        }

        // Prepare product data
        const productForDB = {
          productName: product.productName.trim(),
          productTitle: product.productTitle ? product.productTitle.trim() : product.productName.trim(),
          productDescription: product.productDescription || '',
          price: parseFloat(product.price) || 0,
          discountPrice: product.discountPrice ? parseFloat(product.discountPrice) : undefined,
          stock: parseInt(product.stock) || 0,
          sku: product.sku || '',
          unit: product.unit || 'piece',
          images: images.length > 0 ? images : [],
          category: category._id,
          subcategory: subcategory._id,
          brandName: product.brand || '',
          modelNumber: product.model || '',
          averageRating: parseFloat(product.rating) || 0,
          totalReviews: parseInt(product.reviews) || 0,
          reviews: [], // Empty array - reviews are actual user review objects, not counts
          variants: variants,
          specifications: specifications,
          youtubeVideoUrls: youtubeVideoUrls,
          isActive: product.isActive === true || product.isActive === 'true',
          shipmentLength: product.shipmentLength ? parseFloat(product.shipmentLength) : undefined,
          shipmentWidth: product.shipmentWidth ? parseFloat(product.shipmentWidth) : undefined,
          shipmentHeight: product.shipmentHeight ? parseFloat(product.shipmentHeight) : undefined,
          shipmentWeight: product.shipmentWeight ? parseFloat(product.shipmentWeight) : undefined,
          shipmentWeightUnit: product.shipmentWeightUnit || 'kg'
        };

        // Create product
        const newProduct = new Product(productForDB);
        await newProduct.save();

        console.log(`✅ Created: ${product.productName}`);
        console.log(`   📸 Images: ${images.length} | 📦 Variants: ${variants.length} | ⭐ Rating: ${product.rating}`);
        createdCount++;
      } catch (error) {
        console.error(`❌ Error creating product ${product.productName}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Import completed!`);
    console.log(`📊 Created: ${createdCount} products`);
    console.log(`⏭️  Skipped: ${skippedCount} products (already exist)`);
    if (errorCount > 0) {
      console.log(`⚠️  Errors: ${errorCount} products`);
    }

    // Verify total count
    const totalCount = await Product.countDocuments();
    console.log(`\n📈 Total products in database: ${totalCount}`);

    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(0);
  } catch (err) {
    console.error('❌ Error importing JSON:', err.message);
    process.exit(1);
  }
}

importProductsJSON();
