import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../db/mongo-db-connect.js';
import Category from '../models/category.js';
import Subcategory from '../models/subcategory.js';
import Product from '../models/product.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Proper CSV parser that handles quoted fields with commas
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result.map(v => v.replace(/^"|"$/g, ''));
}

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse rows
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || '';
    });
    records.push(record);
  }

  return records;
}

async function importCSV() {
  try {
    await connectDB();
    console.log('📋 Connected to database\n');

    // Read CSV file
    const csvPath = path.join(__dirname, 'products_bulk_upload.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    
    const records = parseCSV(fileContent);

    console.log(`📦 Processing ${records.length} products from CSV...\n`);

    let createdCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const record of records) {
      try {
        // Skip if no product name
        if (!record.productName || !record.productName.trim()) {
          skippedCount++;
          continue;
        }

        // Check if product already exists
        const existingProduct = await Product.findOne({ sku: record.sku });
        if (existingProduct) {
          console.log(`⏭️  Skipped (already exists): ${record.productName}`);
          skippedCount++;
          continue;
        }

        // Get or create category
        let category = await Category.findOne({ name: record.category });
        if (!category) {
          category = new Category({
            name: record.category,
            description: `${record.category} products`,
            status: 'Active'
          });
          await category.save();
        }

        // Get or create subcategory
        let subcategory = await Subcategory.findOne({ name: record.subcategory });
        if (!subcategory) {
          subcategory = new Subcategory({
            name: record.subcategory,
            category: category._id,
            status: 'Active'
          });
          await subcategory.save();
        }

        // Parse images from CSV (comma-separated URLs)
        let images = [];
        if (record.images && typeof record.images === 'string') {
          images = record.images
            .split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0 && url.toLowerCase() !== 'nan');
        }

        // Parse variants from CSV JSON string
        let variants = [];
        if (record.variants && typeof record.variants === 'string') {
          try {
            variants = JSON.parse(record.variants);
          } catch (e) {
            variants = [];
          }
        }

        // Parse specifications from CSV (key:value pairs separated by commas)
        let specifications = [];
        if (record.specifications && typeof record.specifications === 'string') {
          const specPairs = record.specifications.split(',');
          specPairs.forEach(pair => {
            const [key, value] = pair.split(':').map(s => s.trim());
            if (key && value) {
              specifications.push({ key, value });
            }
          });
        }

        // Parse YouTube URLs
        let youtubeVideoUrls = [];
        if (record.youtubeVideoUrls && typeof record.youtubeVideoUrls === 'string') {
          youtubeVideoUrls = record.youtubeVideoUrls
            .split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0);
        }

        // Parse key features
        let keyFeatures = [];
        if (record.keyFeatures && typeof record.keyFeatures === 'string') {
          keyFeatures = record.keyFeatures
            .split(',')
            .map(f => f.trim())
            .filter(f => f.length > 0);
        }

        // Prepare product data
        const productForDB = {
          productName: record.productName.trim(),
          productTitle: record.productTitle ? record.productTitle.trim() : record.productName.trim(),
          productDescription: record.productDescription || '',
          price: parseFloat(record.price) || 0,
          discountPrice: record.discountPrice ? parseFloat(record.discountPrice) : undefined,
          stock: parseInt(record.stock) || 0,
          sku: record.sku || '',
          unit: record.unit || 'piece',
          images: images.length > 0 ? images : [],
          category: category._id,
          subcategory: subcategory._id,
          variants: variants,
          specifications: specifications,
          youtubeVideoUrls: youtubeVideoUrls,
          keyFeatures: keyFeatures,
          isActive: record.isActive === 'True' || record.isActive === 'true' || record.isActive === 'TRUE',
          shipmentLength: record.shipmentLength ? parseFloat(record.shipmentLength) : undefined,
          shipmentWidth: record.shipmentWidth ? parseFloat(record.shipmentWidth) : undefined,
          shipmentHeight: record.shipmentHeight ? parseFloat(record.shipmentHeight) : undefined,
          shipmentWeight: record.shipmentWeight ? parseFloat(record.shipmentWeight) : undefined
        };

        // Create product
        const product = new Product(productForDB);
        await product.save();

        console.log(`✅ Created: ${record.productName}`);
        console.log(`   📸 Images: ${images.length}`);
        createdCount++;
      } catch (error) {
        console.error(`❌ Error creating product ${record.productName}:`, error.message);
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
    console.error('❌ Error importing CSV:', err.message);
    process.exit(1);
  }
}

importCSV();
