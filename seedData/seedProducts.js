import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Categorization logic
const categorizeProduct = (productName, brand, category) => {
  const name = (productName || '').toLowerCase();
  const categoryName = (category || '').toLowerCase();
  const brandLower = (brand || '').toLowerCase();

  // Laptops Category (check first before checking brands)
  if (
    name.includes('laptop') ||
    name.includes('macbook') ||
    name.includes('book') ||
    name.includes('chromebook') ||
    name.includes('notebook') ||
    categoryName === 'laptop'
  ) {
    return { mainCategory: 'Laptops', subcategory: 'Laptops' };
  }

  // Tablets Category (check before mobile as iPad can contain "phone")
  if (
    name.includes('tablet') ||
    name.includes('ipad') ||
    name.includes('galaxy tab') ||
    categoryName.includes('tablet')
  ) {
    return { mainCategory: 'Tablets', subcategory: 'Tablets' };
  }

  // Mobile Category
  if (
    categoryName === 'smartphone' ||
    categoryName.includes('mobile') ||
    name.includes('iphone') ||
    name.includes('phone') ||
    name.includes('mobile') ||
    name.includes('smartphone') ||
    name.includes('galaxy s') ||
    name.includes('galaxy a') ||
    name.includes('galaxy z')
  ) {
    return { mainCategory: 'Mobile', subcategory: 'Smartphones' };
  }

  // TV Category
  if (
    categoryName === 'tv' ||
    categoryName.includes('tv') ||
    name.includes('tv') ||
    name.includes('terrace') ||
    name.includes('display')
  ) {
    return { mainCategory: 'TV', subcategory: 'Smart TV' };
  }

  // Default to TV if nothing matches
  return { mainCategory: 'TV', subcategory: 'Smart TV' };
};

export const seedProducts = async () => {
  try {
    console.log('🌱 Starting product seeding...');

    const productsJsonPath = path.join(__dirname, 'products.json');

    if (!fs.existsSync(productsJsonPath)) {
      console.error('❌ products.json file not found at:', productsJsonPath);
      return;
    }

    const productsData = JSON.parse(fs.readFileSync(productsJsonPath, 'utf-8'));

    // Create or get categories and subcategories
    const categories = {};
    const categoryList = ['TV', 'Laptops', 'Mobile', 'Tablets'];

    for (const catName of categoryList) {
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

      // Create subcategories
      const subCategoryMap = {
        TV: 'Smart TV',
        Laptops: 'Laptops',
        Mobile: 'Smartphones',
        Tablets: 'Tablets'
      };

      const subCatName = subCategoryMap[catName];
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
        console.log(`✅ Created subcategory: ${subCatName} for ${catName}`);
      }
    }

    // Seed products
    let addedCount = 0;
    let skippedCount = 0;

    for (const productData of productsData) {
      if (!productData || !productData.name) continue;

      try {
        // Check if product already exists
        const existingProduct = await Product.findOne({
          sku: productData.sku
        });

        if (existingProduct) {
          console.log(`⏭️  Product already exists: ${productData.name} (SKU: ${productData.sku})`);
          skippedCount++;
          continue;
        }

        // Categorize product
        const categorization = categorizeProduct(
          productData.name,
          productData.brand,
          productData.category
        );

        const categoryId = categories[categorization.mainCategory];
        const subcategoryDoc = await Subcategory.findOne({
          name: categorization.subcategory,
          category: categoryId
        });

        if (!categoryId || !subcategoryDoc) {
          console.log(
            `⚠️  Failed to find category/subcategory for: ${productData.name}`
          );
          skippedCount++;
          continue;
        }

        // Create product
        const newProduct = await Product.create({
          productName: productData.name,
          productTitle: productData.name,
          productDescription: productData.long_description || productData.description,
          category: categoryId,
          subcategory: subcategoryDoc._id,
          sku: productData.sku,
          price: productData.price || 0,
          discountPrice: productData.on_sale ? productData.price : null,
          stock: productData.in_stock ? 50 : 0,
          modelNumber: productData.model_number,
          brandName: productData.brand,
          images: [productData.image_url],
          keyFeatures: [
            `Category: ${productData.category}`,
            `Brand: ${productData.brand}`,
            `In Stock: ${productData.in_stock ? 'Yes' : 'No'}`
          ],
          specifications: [
            { key: 'SKU', value: productData.sku },
            { key: 'Brand', value: productData.brand },
            { key: 'Model', value: productData.model_number || 'N/A' }
          ],
          averageRating: productData.rating || 0,
          totalReviews: productData.review_count || 0,
          isActive: true
        });

        console.log(
          `✅ Added product: ${productData.name} (Category: ${categorization.mainCategory})`
        );
        addedCount++;
      } catch (err) {
        console.error(
          `❌ Error seeding product ${productData.name}:`,
          err.message
        );
        skippedCount++;
      }
    }

    console.log(
      `\n📊 Product seeding completed! Added: ${addedCount}, Skipped: ${skippedCount}`
    );
  } catch (error) {
    console.error('❌ Error in product seeding:', error.message);
    throw error;
  }
};

// Run if called directly
const args = process.argv.slice(2);
if (args[0] === 'seed') {
  connectDB().then(async () => {
    await seedProducts();
    process.exit(0);
  }).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
}

export default seedProducts;
