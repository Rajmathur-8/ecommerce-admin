import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const seedProductsFromJson = async () => {
  try {
    console.log('🌱 Starting product seeding from products.json...');

    const productsJsonPath = path.join(__dirname, 'products.json');

    if (!fs.existsSync(productsJsonPath)) {
      console.error('❌ products.json file not found at:', productsJsonPath);
      return;
    }

    const data = JSON.parse(fs.readFileSync(productsJsonPath, 'utf-8'));
    const productsData = data.products || [];

    // Create or get categories and subcategories
    const categories = {};
    const subcategories = {};
    
    // Extract unique categories from products
    const categorySet = new Set();
    productsData.forEach(product => {
      if (product.category) {
        categorySet.add(product.category);
      }
    });

    console.log(`📋 Found ${categorySet.size} unique categories`);

    // Create categories and subcategories
    for (const catName of categorySet) {
      try {
        let category = await Category.findOne({ name: catName });
        if (!category) {
          category = await Category.create({
            name: catName,
            description: `${catName} category`,
            isActive: true
          });
          console.log(`✅ Created category: ${catName}`);
        }
        categories[catName] = category._id;

        // Create subcategories for this category
        const subcategoriesToCreate = new Set();
        productsData
          .filter(p => p.category === catName)
          .forEach(p => {
            if (p.subcategory) {
              subcategoriesToCreate.add(p.subcategory);
            }
          });

        for (const subCatName of subcategoriesToCreate) {
          let subcategory = await Subcategory.findOne({
            name: subCatName,
            category: categories[catName]
          });

          if (!subcategory) {
            subcategory = await Subcategory.create({
              name: subCatName,
              category: categories[catName],
              description: `${subCatName} subcategory`,
              isActive: true
            });
            console.log(`✅ Created subcategory: ${subCatName} under ${catName}`);
          }
          subcategories[`${catName}-${subCatName}`] = subcategory._id;
        }
      } catch (err) {
        console.error(`❌ Error creating category ${catName}:`, err.message);
      }
    }

    // Seed products
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const productData of productsData) {
      if (!productData || !productData.productName) continue;

      try {
        const categoryId = categories[productData.category];
        const subcategoryId = subcategories[`${productData.category}-${productData.subcategory}`];

        if (!categoryId || !subcategoryId) {
          console.log(
            `⚠️  Skipping ${productData.productName}: Category or subcategory not found`
          );
          skippedCount++;
          continue;
        }

        // Check if product exists by SKU
        let existingProduct = await Product.findOne({ sku: productData.sku });

        // Parse variants if it's a string
        let variants = productData.variants;
        if (typeof variants === 'string') {
          try {
            variants = JSON.parse(variants);
          } catch (e) {
            variants = [];
          }
        }

        // Parse specifications if it's a string
        let specifications = [];
        if (productData.specifications) {
          if (typeof productData.specifications === 'string') {
            // Convert comma-separated format to array of objects
            productData.specifications.split(',').forEach(spec => {
              const [key, value] = spec.split(':').map(s => s.trim());
              if (key && value) {
                specifications.push({ key, value });
              }
            });
          } else if (Array.isArray(productData.specifications)) {
            specifications = productData.specifications;
          }
        }

        const productPayload = {
          productName: productData.productName,
          productTitle: productData.productName,
          productDescription: productData.description || '',
          category: categoryId,
          subcategory: subcategoryId,
          sku: productData.sku,
          price: productData.price || 0,
          discountPrice: productData.discountPrice || productData.price || 0,
          stock: productData.stock || 0,
          brandName: productData.brand,
          modelNumber: productData.model,
          images: typeof productData.images === 'string' 
            ? productData.images.split(',').map(img => img.trim())
            : productData.images || [],
          youtubeVideoUrls: Array.isArray(productData.youtubeVideoUrls)
            ? productData.youtubeVideoUrls
            : (productData.youtubeVideoUrls ? [productData.youtubeVideoUrls] : []),
          productVideos: productData.productVideos ? 
            (typeof productData.productVideos === 'string'
              ? productData.productVideos.split(',')
              : productData.productVideos)
            : [],
          averageRating: productData.rating || 0,
          totalReviews: productData.reviews || 0,
          variants: variants || [],
          specifications: specifications || [],
          isActive: productData.isActive !== false,
          shipmentLength: productData.shipmentLength,
          shipmentWidth: productData.shipmentWidth,
          shipmentHeight: productData.shipmentHeight,
          shipmentWeight: productData.shipmentWeight,
          frequentlyBoughtTogether: []  // Will be resolved after products are created
        };

        if (existingProduct) {
          // Update existing product
          await Product.findByIdAndUpdate(existingProduct._id, productPayload, { new: true });
          console.log(`🔄 Updated product: ${productData.productName} (SKU: ${productData.sku})`);
          updatedCount++;
        } else {
          // Create new product
          await Product.create(productPayload);
          console.log(`✅ Added product: ${productData.productName} (SKU: ${productData.sku})`);
          addedCount++;
        }
      } catch (err) {
        console.error(
          `❌ Error seeding product ${productData.productName}:`,
          err.message
        );
        skippedCount++;
      }
    }

    console.log(`\n📊 Product seeding completed!`);
    console.log(`   ✅ Added: ${addedCount}`);
    console.log(`   🔄 Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   📦 Total: ${addedCount + updatedCount} products in database`);

  } catch (error) {
    console.error('❌ Error in product seeding:', error.message);
    throw error;
  }
};

// Run if called directly
const args = process.argv.slice(2);
if (args[0] === 'seed') {
  connectDB().then(async () => {
    await seedProductsFromJson();
    process.exit(0);
  }).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
}

export default seedProductsFromJson;
