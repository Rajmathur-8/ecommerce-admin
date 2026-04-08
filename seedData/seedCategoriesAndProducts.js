import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

// Load env from parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

// Try to load .env file
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Still call dotenv.config() to load from default locations
  dotenv.config();
}

// Define categories and subcategories structure
const categoryStructure = [
  {
    name: 'Wearables',
    subcategories: ['Smartwatches', 'Fitness Trackers', 'Smart Bands']
  },
  {
    name: 'Refrigerator',
    subcategories: ['Home & Kitchen Appliances', 'French Door', 'Double Door']
  },
  {
    name: 'Washing Machine',
    subcategories: ['Home & Kitchen Appliances', 'Front Load', 'Top Load']
  },
  {
    name: 'Oven',
    subcategories: ['Home & Kitchen appliances', 'Microwave Ovens', 'Convection Ovens']
  },
  {
    name: 'Water Purifier',
    subcategories: ['Home & Kitchen appliances', 'RO Purifiers', 'UV Purifiers']
  },
  {
    name: 'TV',
    subcategories: ['TV & Display', '4K TVs', '8K TVs']
  },
  {
    name: 'Laptop',
    subcategories: ['Laptop & Computers', 'Gaming Laptops', 'Ultrabooks']
  },
  {
    name: 'Mobiles',
    subcategories: ['Smartphones', 'Flagship', 'Mid-range']
  },
  {
    name: 'Tablet',
    subcategories: ['Tablets', 'iPad', 'Android Tablets']
  }
];

// Function to seed categories and subcategories
async function seedCategories() {
  try {
    console.log('🔄 Seeding categories and subcategories...');
    
    for (const catData of categoryStructure) {
      // Check if category exists
      let category = await Category.findOne({ name: catData.name });
      
      if (!category) {
        category = new Category({
          name: catData.name,
          description: `${catData.name} products`,
          status: 'Active'
        });
        await category.save();
        console.log(`✅ Created category: ${catData.name}`);
      } else {
        console.log(`📌 Category already exists: ${catData.name}`);
      }
      
      // Create subcategories
      for (const subName of catData.subcategories) {
        let subcategory = await Subcategory.findOne({ 
          name: subName, 
          category: category._id 
        });
        
        if (!subcategory) {
          subcategory = new Subcategory({
            name: subName,
            category: category._id,
            isActive: true,
            description: `${subName} under ${catData.name}`
          });
          await subcategory.save();
          console.log(`✅ Created subcategory: ${subName}`);
        } else {
          console.log(`📌 Subcategory already exists: ${subName}`);
        }
      }
    }
    
    console.log('✅ Categories and subcategories seeding completed!');
    return true;
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    throw error;
  }
}

// Function to parse and process product data
async function seedProductsFromCSVs() {
  try {
    console.log('🔄 Seeding products from CSV files...');
    
    const csvFiles = [
      { path: 'GD_Ecommerce_SKU_Wearables.csv', category: 'Wearables', subcategoryName: 'Smartwatches' },
      { path: 'GD_Ecommerce_SKU_HomeAppliances.csv', category: 'Refrigerator', subcategoryName: 'Home & Kitchen Appliances' },
      { path: 'GD_Ecommerce_SKU_KitchenAppliances.csv', category: 'Oven', subcategoryName: 'Home & Kitchen appliances' },
      { path: 'GD_Ecommerce_SKU_TVs.csv', category: 'TV', subcategoryName: 'TV & Display' },
      { path: 'GD_Ecommerce_SKU_Laptops.csv', category: 'Laptop', subcategoryName: 'Laptop & Computers' },
      { path: 'GD_Ecommerce_SKU_Mobiles.csv', category: 'Mobiles', subcategoryName: 'Smartphones' }
    ];
    
    for (const csvFile of csvFiles) {
      const fullPath = path.join(__dirname, csvFile.path);
      
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ CSV file not found: ${fullPath}`);
        continue;
      }
      
      console.log(`📖 Processing: ${path.basename(fullPath)}`);
      
      // Get category and subcategory
      const category = await Category.findOne({ name: csvFile.category });
      const subcategory = await Subcategory.findOne({ 
        name: csvFile.subcategoryName,
        category: category._id 
      });
      
      if (!category || !subcategory) {
        console.warn(`⚠️ Category/Subcategory not found for ${csvFile.category}`);
        continue;
      }
      
      // Parse CSV
      const products = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(fullPath)
          .pipe(csv())
          .on('data', (row) => {
            // Filter out empty rows
            if (!row.Product_Name && !row.ProductName && !row.SKU) {
              return;
            }
            products.push(row);
          })
          .on('end', resolve)
          .on('error', reject);
      });
      
      console.log(`📦 Found ${products.length} products in ${path.basename(fullPath)}`);
      
      // Process and seed products
      let successCount = 0;
      for (const row of products) {
        try {
          const product = createProductFromRow(row, category, subcategory);
          
          if (!product.productName) continue;
          
          // Check if product already exists
          const existingProduct = await Product.findOne({ sku: product.sku });
          if (existingProduct) {
            console.log(`⏭️ Skipping duplicate SKU: ${product.sku}`);
            continue;
          }
          
          const newProduct = new Product(product);
          await newProduct.save();
          successCount++;
          
          if (successCount % 10 === 0) {
            console.log(`✅ Seeded ${successCount} products...`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to seed product: ${error.message}`);
        }
      }
      
      console.log(`✅ Successfully seeded ${successCount} products from ${path.basename(fullPath)}`);
    }
    
    console.log('✅ All products seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding products:', error);
    throw error;
  }
}

// Function to create product object from CSV row
function createProductFromRow(row, category, subcategory) {
  const productName = row.Product_Name || row.productName || '';
  const brand = row.Brand || row.brand || '';
  const sku = row.SKU || row.sku || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  // Parse prices
  const mrp = parseFloat(row.MRP) || 0;
  const sellingPrice = parseFloat(row.Selling_Price) || mrp;
  const purchasePrice = parseFloat(row['Purchase Price']) || 0;
  
  // Parse stock
  const stock = parseInt(row.Stock_Quantity) || 0;
  
  // Parse specifications and additional data
  const specifications = extractSpecifications(row);
  const images = extractImages(row);
  const videos = extractVideos(row);
  
  const product = {
    productName: productName.trim(),
    productTitle: row['Model_Number'] ? `${productName} - ${row.Model_Number}` : productName.trim(),
    productDescription: row.Long_Description || row.Short_Description || `Premium ${productName}`,
    category: category._id,
    subcategory: subcategory._id,
    sku: sku.trim(),
    brand: brand,
    brandName: brand,
    modelNumber: row.Model_Number || '',
    manufacturerPartNumber: row.manufacturerPartNumber || '',
    price: sellingPrice || mrp,
    discountPrice: sellingPrice < mrp ? sellingPrice : undefined,
    stock: stock,
    unit: 'piece',
    images: images,
    youtubeVideoUrls: videos.youtube,
    productVideos: videos.other,
    specifications: specifications,
    keyFeatures: extractKeyFeatures(row),
    whatsInBox: (row.Whats_In_The_Box || '').split(',').filter(item => item.trim()),
    isActive: true,
    isPreOrder: false,
    // Shipping info
    shipmentLength: parseFloat(row.Shipping_Dimensions_cm) || undefined,
    shipmentWidth: undefined,
    shipmentHeight: undefined,
    shipmentWeight: parseFloat(row.Shipping_Weight_kg) || undefined,
    // Additional fields from CSV
    eanCode: row.EAN_Code || row.HSN_Code || ''
  };
  
  return product;
}

// Extract specifications from row
function extractSpecifications(row) {
  const specs = [];
  
  // Common specification fields across all CSVs
  const specFields = [
    { csv: 'Attribute_Color', key: 'Color' },
    { csv: 'Attribute_Storage', key: 'Storage' },
    { csv: 'Attribute_RAM', key: 'RAM' },
    { csv: 'Attribute_Capacity', key: 'Capacity' },
    { csv: 'Attribute_Control type', key: 'Control Type' },
    { csv: 'Attribute_Target Audience', key: 'Target Audience' },
    { csv: 'Filter_OS', key: 'Operating System' },
    { csv: 'Filter_Processor', key: 'Processor' },
    { csv: 'Filter_Display_Type', key: 'Display Type' },
    { csv: 'Filter_Screen_Size_inch', key: 'Screen Size' },
    { csv: 'Filter_Screen size', key: 'Screen Size' },
    { csv: 'Filter_Type', key: 'Type' },
    { csv: 'Attribute_Upscaling', key: 'Upscaling' },
    { csv: 'Attribute_Resolution', key: 'Resolution' },
    { csv: 'Filter_Display type', key: 'Display Type' },
    { csv: 'Filter_Number of HDMI/USB Ports', key: 'HDMI/USB Ports' },
    { csv: 'Attribute_Dial shape', key: 'Dial Shape' },
    { csv: 'Filter_Battery Backup', key: 'Battery Backup' },
    { csv: 'Attribute_Year of Edition', key: 'Year' },
    { csv: 'Technical Specification', key: 'Specifications' }
  ];
  
  for (const field of specFields) {
    const value = row[field.csv];
    if (value && value.toString().trim()) {
      specs.push({
        key: field.key,
        value: value.toString().trim()
      });
    }
  }
  
  return specs;
}

// Extract images from row
function extractImages(row) {
  const images = [];
  for (let i = 1; i <= 6; i++) {
    const imgField = `Image_URL_${i}`;
    if (row[imgField] && row[imgField].trim()) {
      images.push(row[imgField].trim());
    }
  }
  return images.length > 0 ? images : ['https://via.placeholder.com/400'];
}

// Extract videos from row
function extractVideos(row) {
  const youtube = [];
  const other = [];
  
  for (let i = 1; i <= 2; i++) {
    const videoField = `Video_URL_${i}`;
    if (row[videoField] && row[videoField].trim()) {
      const url = row[videoField].trim();
      if (url.includes('youtube.com')) {
        youtube.push(url);
      } else {
        other.push(url);
      }
    }
  }
  
  return { youtube, other };
}

// Extract key features from row
function extractKeyFeatures(row) {
  const features = [];
  
  // Try to extract from description or specific fields
  if (row.Short_Description && row.Short_Description.trim()) {
    // Split by common delimiters
    const featureList = row.Short_Description.split(/[,;]|(?=•)/).map(f => f.trim()).filter(f => f && f.length > 0);
    features.push(...featureList.slice(0, 5)); // Take first 5 features
  }
  
  return features.length > 0 ? features : ['Premium Quality', 'Reliable Performance', 'Excellent Design'];
}

// Main seeding function
async function runSeeding() {
  try {
    console.log('🚀 Starting comprehensive seeding process...\n');
    
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database\n');
    
    // Seed categories first
    await seedCategories();
    console.log();
    
    // Then seed products - CSV files need to be in seedData folder
    // For now, we'll skip CSV seeding as files need to be copied there
    console.log('📝 Note: To seed products from CSV files, ensure the CSV files are in the seedData folder');
    console.log('📝 CSV files expected:');
    console.log('   - GD_Ecommerce_SKU_Wearables.csv');
    console.log('   - GD_Ecommerce_SKU_HomeAppliances.csv');
    console.log('   - GD_Ecommerce_SKU_KitchenAppliances.csv');
    console.log('   - GD_Ecommerce_SKU_TVs.csv');
    console.log('   - GD_Ecommerce_SKU_Laptops.csv');
    console.log('   - GD_Ecommerce_SKU_Mobiles.csv\n');
    
    // Try to seed from CSVs if they exist
    await seedProductsFromCSVs();
    
    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run seeding
runSeeding();
