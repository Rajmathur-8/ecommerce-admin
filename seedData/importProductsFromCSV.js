import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const username = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const clusterName = process.env.MONGO_CLUSTER_NAME;

const connection_string = `mongodb+srv://${username}:${password}@${clusterName}.2kldzpk.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ClusterGD`;

// Product Schema
const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  brand: String,
  category: String,
  subcategory: String,
  price: Number,
  discountPrice: Number,
  stock: { type: Number, default: 0 },
  images: [String],
  description: String,
  shortDescription: String,
  ratings: { type: Number, default: 0 },
  reviews: [Object],
  attributes: Object,
  sku: String,
  modelNumber: String,
  status: { type: String, default: 'Active' },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// Category Schema for getting category IDs
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String },
  description: { type: String },
  status: { type: String, default: 'Active' },
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

const uploadProducts = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(connection_string, { family: 4 });
    console.log('✅ Connected to MongoDB\n');

    // Read CSV file from Downloads
    const csvPath = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'GD_Ecommerce _SKU - Mobiles.csv');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found at ${csvPath}`);
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
    });

    console.log(`📦 Found ${records.length} products in CSV\n`);

    // Get category mapping
    const categories = await Category.find({}, { _id: 1, name: 1 });
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.name] = cat._id;
    });

    console.log(`📂 Available categories: ${Object.keys(categoryMap).join(', ')}\n`);

    let added = 0;
    let skipped = 0;
    const categoryCount = {};

    for (const record of records) {
      try {
        // Skip empty rows
        if (!record.Product_Name || !record.Product_Name.trim()) {
          continue;
        }

        const categoryName = (record.Category || 'Mobile').trim();
        const categoryId = categoryMap[categoryName];

        if (!categoryId) {
          console.log(`⚠️  Skipped: ${record.Product_Name} (${categoryName} not in database)`);
          skipped++;
          continue;
        }

        // Extract images (filter empty ones)
        const images = [
          record.Image_URL_1,
          record.Image_URL_2,
          record.Image_URL_3,
          record.Image_URL_4,
          record.Image_URL_5,
          record.Image_URL_6,
        ].filter(url => url && url.trim() && !url.includes('undefined'));

        // Map CSV fields to product schema
        const productData = {
          sku: record.SKU,
          productName: record.Product_Name.trim(),
          brand: record.Brand || 'Unknown',
          category: categoryId,
          subcategory: record.Sub_Category || 'General',
          modelNumber: record.Model_Number || '',
          price: parseInt(record.MRP) || parseInt(record.Selling_Price) || 0,
          discountPrice: parseInt(record.Selling_Price) || parseInt(record.MRP) || 0,
          stock: parseInt(record.Stock_Quantity) || 10,
          description: record.Long_Description || record.Short_Description || '',
          shortDescription: record.Short_Description || '',
          images: images.length > 0 ? images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop'],
          attributes: {
            color: record.Attribute_Color || '',
            storage: record.Attribute_Storage || '',
            ram: record.Attribute_RAM || '',
            os: record.Filter_OS || '',
            screenSize: record.Filter_Screen_Size_inch || '',
            displayType: record.Filter_Display_Type || '',
            processor: record.Filter_Processor || '',
            primaryCamera: record.Filter_Primary_Camera_MP || '',
            battery: record.Filter_Battery_mAh || '',
            networkType: record.Filter_Network_Type || '',
          },
          status: 'Active',
        };

        // Check if product already exists by SKU
        const exists = await Product.findOne({ sku: productData.sku });
        if (exists) {
          console.log(`⏭️  Skipped: ${productData.productName} (SKU: ${productData.sku}) - already exists`);
          skipped++;
        } else {
          await Product.create(productData);
          console.log(`✅ Added: ${productData.productName} → ${categoryName}`);
          added++;
          categoryCount[categoryName] = (categoryCount[categoryName] || 0) + 1;
        }
      } catch (error) {
        console.error(`❌ Error processing product: ${error.message}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`✅ Added: ${added} products`);
    console.log(`⏭️  Skipped: ${skipped} products`);
    console.log(`\n📂 Products by category:`);
    Object.entries(categoryCount).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} products`);
    });

    console.log(`\n✨ Import completed successfully!`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
};

uploadProducts();
