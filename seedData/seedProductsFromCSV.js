import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import csv from 'csv-parser';
import CategoryModel from '../models/category.js';
import SubcategoryModel from '../models/subcategory.js';
import ProductModel from '../models/product.js';

dotenv.config();

// Construct MongoDB URL from environment variables
const MONGO_URL = process.env.MONGO_URL || 
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTER_NAME}.2kldzpk.mongodb.net/ecommerce?retryWrites=true&w=majority&appName=ClusterGD`;

// Category and Subcategory mapping from CSVs
const CATEGORY_SUBCATEGORY_MAP = {
  'Mobiles': {
    image: 'https://images.samsung.com/in/smartphones/galaxy-s25-ultra/buy/product_color_silverBlue_PC.png',
    subcategories: ['Smartphones', 'Tablet']
  },
  'Laptop': {
    image: 'https://images.samsung.com/is/image/samsung/assets/in/galaxy-book/galaxy-book5/buy/GB4_Edge_Carousel_Product-KV_MS_UK_PC.jpg',
    subcategories: ['Laptop & Computers']
  },
  'Refrigerator': {
    image: 'https://images.samsung.com/is/image/samsung/p6pim/in/rm90f66cnctl/gallery/in-4-door-french-door-refrigerators-with-ai-home-and-ai-hybrid-cooling-rm90f66cnctl-548045057?$684_547_PNG$',
    subcategories: ['Home & Kitchen Appliances']
  },
  'Washing Machine': {
    image: 'https://images.samsung.com/is/image/samsung/p6pim/in/feature/165516263/in-feature---542989080.mp4',
    subcategories: ['Home & Kitchen Appliances']
  },
  'Oven': {
    image: 'https://images.samsung.com/is/image/samsung/p6pim/in/mc28a5147vk-tl/gallery/in-mw5100hmc28a5135ck-479730-mc28a5147vk-tl-538377437?$684_547_PNG$',
    subcategories: ['Home & Kitchen appliances']
  },
  'Water Purifier': {
    image: 'https://www.lg.com/content/dam/channel/wcms/in/water-purifiers/gallery/ww156rttc/ww156rttc-dz-1.jpg/jcr:content/renditions/thum-1600x1062.jpeg?w=808',
    subcategories: ['Home & Kitchen appliances']
  },
  'TV': {
    image: 'https://images.samsung.com/is/image/samsung/p6pim/in/qa85qn950fuxxl/gallery/in-qled-qn950f-qa85qn950fuxxl-545965034?$684_547_PNG$',
    subcategories: ['TV & Display']
  },
  'Watch': {
    image: 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/MGHR4ref_VW_34FR+watch-case-49-titanium-black-ultra3_VW_34FR+watch-face-49-milanese-ultra3_VW_34FR_GEO_IN?wid=5120&hei=3280&bgc=fafafa&trim=1&fmt=p-jpg&qlt=80',
    subcategories: ['Wearables']
  }
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Create categories and subcategories
const createCategoriesAndSubcategories = async () => {
  console.log('\n📦 Creating Categories and Subcategories...');
  
  const categoryMap = {}; // Map category name to ID
  
  for (const [categoryName, categoryData] of Object.entries(CATEGORY_SUBCATEGORY_MAP)) {
    try {
      // Create or find category
      let category = await CategoryModel.findOne({ name: categoryName });
      if (!category) {
        category = new CategoryModel({
          name: categoryName,
          image: categoryData.image,
          description: `${categoryName} and related products`,
          status: 'Active'
        });
        await category.save();
        console.log(`✅ Created category: ${categoryName}`);
      } else {
        console.log(`⏭️  Category already exists: ${categoryName}`);
      }
      
      categoryMap[categoryName] = category._id;
      
      // Create subcategories
      for (const subcategoryName of categoryData.subcategories) {
        let subcategory = await SubcategoryModel.findOne({
          name: subcategoryName,
          category: category._id
        });
        
        if (!subcategory) {
          subcategory = new SubcategoryModel({
            name: subcategoryName,
            category: category._id,
            description: `${subcategoryName} under ${categoryName}`,
            isActive: true
          });
          await subcategory.save();
          console.log(`  ✅ Created subcategory: ${subcategoryName}`);
        } else {
          console.log(`  ⏭️  Subcategory already exists: ${subcategoryName}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error creating category ${categoryName}:`, error.message);
    }
  }
  
  return categoryMap;
};

// Parse CSV file
const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Filter out empty rows
        if (Object.values(data).some(val => val && val.trim())) {
          results.push(data);
        }
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

// Transform product data based on category
const transformProductData = (row, categoryId, subcategoryId, categoryName) => {
  const parsePrice = (price) => {
    if (!price) return 0;
    return parseFloat(price.toString().replace(/,/g, '')) || 0;
  };

  const parseImages = (imageURLs) => {
    if (!imageURLs) return [];
    const images = [];
    for (let i = 1; i <= 6; i++) {
      const url = row[`Image_URL_${i}`];
      if (url && url.trim()) {
        images.push(url.trim());
      }
    }
    return images;
  };

  const parseVideos = (videoURLs) => {
    const videos = [];
    if (row.Video_URL_1 && row.Video_URL_1.trim()) {
      videos.push(row.Video_URL_1.trim());
    }
    if (row.Video_URL_2 && row.Video_URL_2.trim()) {
      videos.push(row.Video_URL_2.trim());
    }
    return videos;
  };

  const productName = row.Product_Name || row['Product_Name'] || 'Unknown Product';
  const sku = row.SKU || `${categoryName.substring(0, 3).toUpperCase()}-${Date.now()}`;
  
  const productData = {
    productName: productName.trim(),
    productTitle: productName.trim(),
    productDescription: row.Long_Description || row.Short_Description || '',
    category: categoryId,
    subcategory: subcategoryId,
    sku: sku.trim(),
    unit: 'piece',
    price: parsePrice(row.MRP || row.Selling_Price),
    discountPrice: parsePrice(row.Selling_Price || row.MRP),
    stock: parseInt(row.Stock_Quantity) || 0,
    brandName: (row.Brand || '').trim(),
    modelNumber: (row.Model_Number || '').trim(),
    manufacturerPartNumber: (row.manufacturerPartNumber || '').trim(),
    eanCode: (row.HSN_Code || '').trim(),
    images: parseImages(),
    youtubeVideoUrls: [],
    productVideos: parseVideos(),
    // Specifications based on filter columns
    specifications: [],
    // Key features
    keyFeatures: [],
    // What's in box
    whatsInBox: (row.Whats_In_The_Box || '').split(',').map(item => item.trim()).filter(item => item) || [],
    // Shipment dimensions
    shipmentLength: parseFloat(row.Shipping_Dimensions_cm) || undefined,
    shipmentWidth: undefined,
    shipmentHeight: undefined,
    shipmentWeight: parseFloat(row.Shipping_Weight_kg) || undefined,
    isActive: true,
    isPreOrder: false,
    variants: []
  };

  // Add filter-based specifications
  const filterFields = {
    'Filter_OS': 'Operating System',
    'Filter_Screen_Size_inch': 'Screen Size (inches)',
    'Filter_Display_Type': 'Display Type',
    'Filter_Processor': 'Processor',
    'Filter_Primary_Camera_MP': 'Primary Camera (MP)',
    'Filter_Battery_mAh': 'Battery (mAh)',
    'Filter_Network_Type': 'Network Type',
    'Filter_Type': 'Type',
    'Filter_Ideal for Family size': 'Ideal For',
    'Filter_Defrosting type': 'Defrosting Type',
    'Filter_Star': 'Rating',
    'Filter_Power Consumption': 'Power Consumption',
    'Filter_Capacity': 'Capacity',
    'Filter_Number of HDMI/USB Ports': 'Ports',
  };

  for (const [key, label] of Object.entries(filterFields)) {
    if (row[key] && row[key].trim()) {
      productData.specifications.push({
        key: label,
        value: row[key].trim()
      });
    }
  }

  // Add attribute-based specifications
  const attributeFields = {
    'Attribute_Color': 'Color',
    'Attribute_Storage': 'Storage',
    'Attribute_RAM': 'RAM',
    'Attribute_Capacity': 'Capacity',
    'Attribute_Control type': 'Control Type',
    'Attribute_Target Audience': 'Target Audience',
    'Attribute_Dial shape': 'Dial Shape',
    'Attribute_Upscaling': 'Upscaling',
    'Attribute_Resolution': 'Resolution',
    'Attribute_Audio': 'Audio',
    'Attribute_Year of Edition': 'Year of Edition',
    'Attribute_Picture Engine': 'Picture Engine'
  };

  for (const [key, label] of Object.entries(attributeFields)) {
    if (row[key] && row[key].trim()) {
      productData.specifications.push({
        key: label,
        value: row[key].trim()
      });
    }
  }

  // Add key features if available
  if (row.Technical_Specification && row.Technical_Specification.trim()) {
    productData.keyFeatures.push(row.Technical_Specification.trim());
  }

  return productData;
};

// Seed products from CSV files
const seedProductsFromCSVs = async (categoryMap) => {
  const csvFiles = [
    { path: 'd:/RESO/ecommerce-admin-main/seedData/GD_Ecommerce_SKU_Mobiles.csv', categoryName: 'Mobiles' },
    { path: 'd:/RESO/ecommerce-admin-main/seedData/GD_Ecommerce_SKU_Laptops.csv', categoryName: 'Laptop' },
    { path: 'd:/RESO/ecommerce-admin-main/seedData/GD_Ecommerce_SKU_HomeAppliances.csv', categoryName: 'Refrigerator' },
    { path: 'd:/RESO/ecommerce-admin-main/seedData/GD_Ecommerce_SKU_KitchenAppliances.csv', categoryName: 'Oven' },
    { path: 'd:/RESO/ecommerce-admin-main/seedData/GD_Ecommerce_SKU_TVs.csv', categoryName: 'TV' },
    { path: 'd:/RESO/ecommerce-admin-main/seedData/GD_Ecommerce_SKU_Wearables.csv', categoryName: 'Watch' }
  ];

  let totalCreated = 0;
  let totalFailed = 0;

  for (const csvFile of csvFiles) {
    if (!fs.existsSync(csvFile.path)) {
      console.log(`⚠️  Skipping ${csvFile.categoryName} - CSV file not found at ${csvFile.path}`);
      continue;
    }

    try {
      console.log(`\n📥 Processing ${csvFile.categoryName} products...`);
      const rows = await parseCSVFile(csvFile.path);
      
      if (rows.length === 0) {
        console.log(`⚠️  No data found in ${csvFile.categoryName} CSV`);
        continue;
      }

      // Get category ID and determine correct subcategory based on Sub_Category field from CSV
      const categoryId = categoryMap[csvFile.categoryName];
      if (!categoryId) {
        console.log(`⚠️  Category not found: ${csvFile.categoryName}`);
        continue;
      }

      let categoryCount = 0;

      for (const row of rows) {
        try {
          const productName = row.Product_Name || row['Product_Name'];
          if (!productName || !productName.trim()) {
            continue; // Skip empty rows
          }

          const sku = row.SKU || row.Column_1;
          if (!sku || !sku.trim()) {
            continue; // Skip rows without SKU
          }

          // Determine subcategory from CSV Sub_Category field
          let subcategoryName = row.Sub_Category || row['Sub_Category'];
          if (!subcategoryName) {
            // Use first subcategory for this category if not specified
            subcategoryName = CATEGORY_SUBCATEGORY_MAP[csvFile.categoryName].subcategories[0];
          }

          // Find the subcategory
          let subcategory = await SubcategoryModel.findOne({
            category: categoryId,
            $or: [
              { name: subcategoryName },
              { name: new RegExp(subcategoryName.split(' ')[0], 'i') }
            ]
          });

          if (!subcategory) {
            // Use first subcategory for this category
            subcategory = await SubcategoryModel.findOne({ category: categoryId });
          }

          if (!subcategory) {
            console.log(`  ⚠️  No subcategory found for product: ${productName}`);
            continue;
          }

          // Check if product already exists
          const existingProduct = await ProductModel.findOne({ 
            sku: sku.trim()
          });

          if (existingProduct) {
            // Update existing product
            const updatedData = transformProductData(row, categoryId, subcategory._id, csvFile.categoryName);
            await ProductModel.findByIdAndUpdate(existingProduct._id, updatedData);
          } else {
            // Create new product
            const productData = transformProductData(row, categoryId, subcategory._id, csvFile.categoryName);
            const product = new ProductModel(productData);
            await product.save();
          }

          categoryCount++;
          totalCreated++;
        } catch (error) {
          console.error(`  ❌ Error processing product: ${error.message}`);
          totalFailed++;
        }
      }

      console.log(`✅ Processed ${categoryCount} ${csvFile.categoryName} products`);
    } catch (error) {
      console.error(`❌ Error reading CSV file ${csvFile.categoryName}:`, error.message);
      totalFailed += 1;
    }
  }

  return { totalCreated, totalFailed };
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    
    const categoryMap = await createCategoriesAndSubcategories();
    const { totalCreated, totalFailed } = await seedProductsFromCSVs(categoryMap);

    console.log('\n' + '='.repeat(50));
    console.log('🎉 Seeding completed!');
    console.log(`✅ Products created/updated: ${totalCreated}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log('='.repeat(50) + '\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

main();
