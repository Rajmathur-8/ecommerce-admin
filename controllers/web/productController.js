import Product from '../../models/product.js';
import stockMonitoringService from '../../services/stockMonitoringService.js';
import PreOrderNotification from '../../models/preOrderNotification.js';
import { sendPreOrderNotification } from '../../services/notificationService.js';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const createProduct = async (req, res) => {
  try {
    let data = req.body;
    
    // Handle images from middleware
    if (req.imageUrls && Array.isArray(req.imageUrls)) {
      data.images = req.imageUrls;
    }
    
    // Handle video files from middleware (multiple)
    if (req.productVideoUrls && Array.isArray(req.productVideoUrls)) {
      data.productVideos = req.productVideoUrls;
    }
    
    // Parse YouTube video URLs from FormData
    if (data.youtubeVideoUrls && typeof data.youtubeVideoUrls === 'string') {
      try {
        data.youtubeVideoUrls = JSON.parse(data.youtubeVideoUrls);
      } catch (error) {
        data.youtubeVideoUrls = [];
      }
    }
    
    // Handle variant images from middleware
    if (req.variantImageUrls && Array.isArray(req.variantImageUrls)) {
      // Create a map of variant index to image URL
      const variantImageMap = {};
      req.variantImageUrls.forEach((item) => {
        variantImageMap[item.index] = item.url;
      });
      
      // Store for later use when parsing variants
      req.variantImageMap = variantImageMap;
    }
    
    // Parse JSON fields from FormData
    if (data.variants && typeof data.variants === 'string') {
      try {
        data.variants = JSON.parse(data.variants);
        
        // Assign uploaded variant images to variants
        if (req.variantImageMap) {
          data.variants = data.variants.map((variant, index) => {
            if (req.variantImageMap[index]) {
              variant.image = req.variantImageMap[index];
            }
            return variant;
          });
        }
      } catch (error) {
        data.variants = [];
      }
    }
    
    // Parse keyFeatures, whatsInBox, and specifications from FormData
    if (data.keyFeatures && typeof data.keyFeatures === 'string') {
      try {
        data.keyFeatures = JSON.parse(data.keyFeatures);
      } catch (error) {
        data.keyFeatures = [];
      }
    }
    
    if (data.whatsInBox && typeof data.whatsInBox === 'string') {
      try {
        data.whatsInBox = JSON.parse(data.whatsInBox);
      } catch (error) {
        data.whatsInBox = [];
      }
    }
    
    if (data.specifications && typeof data.specifications === 'string') {
      try {
        data.specifications = JSON.parse(data.specifications);
      } catch (error) {
        data.specifications = [];
      }
    }
    
    // Parse frequentlyBoughtTogether from FormData
    if (data.frequentlyBoughtTogether && typeof data.frequentlyBoughtTogether === 'string') {
      try {
        data.frequentlyBoughtTogether = JSON.parse(data.frequentlyBoughtTogether);
      } catch (error) {
        data.frequentlyBoughtTogether = [];
      }
    }
    
    // Handle manual product images from middleware
    let manualProductImageMap = {};
    if (req.manualProductImageUrls && Array.isArray(req.manualProductImageUrls)) {
      req.manualProductImageUrls.forEach((item) => {
        manualProductImageMap[item.index] = item.url;
      });
    }
    
    // Parse and handle manual frequently bought together products
    if (data.manualFrequentlyBoughtTogether && typeof data.manualFrequentlyBoughtTogether === 'string') {
      try {
        const manualProducts = JSON.parse(data.manualFrequentlyBoughtTogether);
        
        // Update manual products with uploaded image URLs
        if (Array.isArray(manualProducts)) {
          // Upload base64 images to Cloudinary
          for (let index = 0; index < manualProducts.length; index++) {
            const product = manualProducts[index];
            
            // If we have an uploaded image URL for this index, use it
            if (manualProductImageMap[index] !== undefined) {
              product.images = [manualProductImageMap[index]];
              console.log(`✅ Manual product ${index} image from file upload: ${manualProductImageMap[index]}`);
            } else if (product.imageBase64) {
              // Upload base64 image to Cloudinary
              try {
                const base64Data = product.imageBase64;
                // Remove data URL prefix if present
                const base64String = base64Data.includes(',') 
                  ? base64Data.split(',')[1] 
                  : base64Data;
                
                const uploadResult = await cloudinary.uploader.upload(
                  `data:image/jpeg;base64,${base64String}`,
                  {
                    folder: 'product/manual-products',
                    resource_type: 'image',
                    public_id: `manual-${Date.now()}-${index}`,
                  }
                );
                
                product.images = [uploadResult.secure_url];
                console.log(`✅ Manual product ${index} base64 image uploaded to Cloudinary: ${uploadResult.secure_url}`);
              } catch (error) {
                product.images = [];
              }
            } else {
              product.images = product.images || [];
            }
            // Remove temporary fields
            delete product.imageBase64;
          }
          
          // Merge manual products with regular frequentlyBoughtTogether
          if (!data.frequentlyBoughtTogether) {
            data.frequentlyBoughtTogether = [];
          }
          // Add manual products as full objects (backend will handle them separately if needed)
          // For now, we'll store them in a separate field
          data.manualFrequentlyBoughtTogether = manualProducts;
        }
      } catch (error) {
      }
    }
    
    // Convert numeric fields
    if (data.price) {
      data.price = parseFloat(data.price);
    }
    if (data.discountPrice) {
      data.discountPrice = parseFloat(data.discountPrice);
    }
    if (data.stock) {
      data.stock = parseInt(data.stock);
    }
    if (data.shipmentLength) {
      data.shipmentLength = parseFloat(data.shipmentLength);
    }
    if (data.shipmentWidth) {
      data.shipmentWidth = parseFloat(data.shipmentWidth);
    }
    if (data.shipmentHeight) {
      data.shipmentHeight = parseFloat(data.shipmentHeight);
    }
    if (data.shipmentWeight) {
      data.shipmentWeight = parseFloat(data.shipmentWeight);
    }
    if (data.isActive !== undefined) {
      data.isActive = data.isActive === 'true';
    }
    if (data.isPreOrder !== undefined) {
      data.isPreOrder = data.isPreOrder === 'true' || data.isPreOrder === true;
    }
    
    console.log('📦 Creating product with frequentlyBoughtTogether:', data.frequentlyBoughtTogether);
    console.log('📦 Creating product with manualFrequentlyBoughtTogether:', data.manualFrequentlyBoughtTogether);
    
    const product = await Product.create(data);
    
    console.log('✅ Product created with ID:', product._id);
    console.log('✅ Product frequentlyBoughtTogether:', product.frequentlyBoughtTogether);
    console.log('✅ Product manualFrequentlyBoughtTogether:', product.manualFrequentlyBoughtTogether);
    
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create product', error: err.message });
  }
};

export const getProducts = async (req, res) => {
  try {
    const { 
      search, 
      category, 
      limit, 
      page, 
      minPrice, 
      maxPrice, 
      sort,
      inStock,
      // Specification filters
      ram,
      rom,
      battery,
      processor,
      camera,
      resolution,
      screenSize,
      brand
    } = req.query;

    // Build query object
    let query = {};

    // Search functionality - case insensitive and partial matching
    if (search) {
      const searchTerm = search.trim();
      
      // Create regex pattern that matches the search term anywhere in the text
      const regexPattern = `.*${searchTerm}.*`;
      
      // Split search term into individual words for better variant attribute matching
      const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
      
      // Common variant attribute keys to search in (try both capitalized and lowercase versions)
      const commonAttributeKeys = ['RAM', 'ROM', 'Storage', 'Color', 'Size', 'Capacity', 'Memory', 'Screen Size', 'Display', 
                                    'ram', 'rom', 'storage', 'color', 'size', 'capacity', 'memory', 'screen size', 'display'];
      
      // Build variant attribute search conditions using $elemMatch
      const variantAttributeConditions = [];
      
      // For each search word, check if it matches any variant attribute value
      searchWords.forEach(word => {
        const wordRegex = `.*${word}.*`;
        
        // Search in each common attribute key (both capitalized and lowercase)
        commonAttributeKeys.forEach(key => {
          variantAttributeConditions.push({
            variants: {
              $elemMatch: {
                [`attributes.${key}`]: { $regex: wordRegex, $options: 'i' }
              }
            }
          });
        });
      });
      
      // Also search in variantName (both full phrase and individual words)
      variantAttributeConditions.push({
        variants: {
          $elemMatch: {
            variantName: { $regex: regexPattern, $options: 'i' }
          }
        }
      });
      
      // Search individual words in variantName
      searchWords.forEach(word => {
        const wordRegex = `.*${word}.*`;
        variantAttributeConditions.push({
          variants: {
            $elemMatch: {
              variantName: { $regex: wordRegex, $options: 'i' }
            }
          }
        });
      });
      
      // Build search conditions for product fields
      // First, try full phrase match
      const productSearchConditions = [
        { productName: { $regex: regexPattern, $options: 'i' } }, // Case insensitive search in product name
        { productTitle: { $regex: regexPattern, $options: 'i' } }, // Case insensitive search in product title
        { productDescription: { $regex: regexPattern, $options: 'i' } }, // Case insensitive search in description
        { sku: { $regex: regexPattern, $options: 'i' } }, // Case insensitive search in SKU
        { brandName: { $regex: regexPattern, $options: 'i' } } // Search in brand name
      ];
      
      // Also search for individual words in product fields (for better matching like "samsung s24")
      // This ensures "samsung s24" matches products with "Samsung" and "S24" anywhere in the name
      searchWords.forEach(word => {
        // Escape special regex characters in word
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordRegex = `.*${escapedWord}.*`;
        productSearchConditions.push(
          { productName: { $regex: wordRegex, $options: 'i' } },
          { productTitle: { $regex: wordRegex, $options: 'i' } },
          { productDescription: { $regex: wordRegex, $options: 'i' } },
          { brandName: { $regex: wordRegex, $options: 'i' } }
        );
      });
      
      // For multi-word searches like "samsung s24 8gb blue", ensure all words are present
      // Variant attributes must be in the SAME variant (combination match)
      if (searchWords.length > 1) {
        // Separate words that might be variant attributes vs product name words
        // Common variant attribute patterns: numbers with units (8gb, 128gb), colors (blue, red), etc.
        const variantAttributePatterns = [
          /^\d+\s*(gb|g|tb|t|mb|m)$/i, // RAM/ROM: 8gb, 128gb, etc.
          /^(blue|red|green|yellow|black|white|silver|gold|pink|purple|orange|gray|grey)$/i, // Colors
          /^\d+\s*(inch|in|"|')$/i, // Screen size
          /^\d+\s*(mp|megapixel)$/i, // Camera
          /^\d+\s*(mah|mah)$/i // Battery
        ];
        
        const variantWords = searchWords.filter(word => 
          variantAttributePatterns.some(pattern => pattern.test(word))
        );
        const productWords = searchWords.filter(word => 
          !variantAttributePatterns.some(pattern => pattern.test(word))
        );
        
        const allWordsConditions = [];
        
        // Product name words must match in product fields
        productWords.forEach(word => {
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const wordRegex = `.*${escapedWord}.*`;
          allWordsConditions.push({
            $or: [
              { productName: { $regex: wordRegex, $options: 'i' } },
              { productTitle: { $regex: wordRegex, $options: 'i' } },
              { productDescription: { $regex: wordRegex, $options: 'i' } },
              { brandName: { $regex: wordRegex, $options: 'i' } },
              { sku: { $regex: wordRegex, $options: 'i' } }
            ]
          });
        });
        
        // Variant attribute words must ALL be in the SAME variant (combination match)
        if (variantWords.length > 0) {
          const variantMatchConditions = [];
          
          // Build conditions for each variant attribute word
          variantWords.forEach(word => {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordRegex = `.*${escapedWord}.*`;
            
            const wordConditions = [];
            // Check in all attribute keys
            commonAttributeKeys.forEach(key => {
              wordConditions.push({
                [`attributes.${key}`]: { $regex: wordRegex, $options: 'i' }
              });
            });
            // Also check variantName
            wordConditions.push({
              variantName: { $regex: wordRegex, $options: 'i' }
            });
            
            variantMatchConditions.push({ $or: wordConditions });
          });
          
          // All variant words must match in the same variant using $elemMatch with $and
          allWordsConditions.push({
            variants: {
              $elemMatch: {
                $and: variantMatchConditions
              }
            }
          });
        }
        
        // If we have both product words and variant words, use AND
        // If only product words, use AND for product words
        // If only variant words, use the variant condition
        if (allWordsConditions.length > 0) {
          query.$and = allWordsConditions;
        }
      } else {
        // For single word searches, use OR condition
        query.$or = [
          ...productSearchConditions,
          ...variantAttributeConditions
        ];
      }
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Stock filter
    if (inStock === 'true') {
      query.stock = { $gt: 0 };
    }

    // Brand filter
    if (brand) {
      query.brandName = { $regex: brand, $options: 'i' };
    }

    // Specification-based filters (for mobile/electronics)
    const specFilters = [];
    
    // Helper function to create flexible regex pattern for partial matching
    const createFlexibleRegex = (value) => {
      // Escape special regex characters
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Create pattern that matches the value with optional spaces and units
      // e.g., "8" matches "8GB", "8 GB", "8gb", "8 gb", "8GB RAM", "8 GB RAM", etc.
      // Pattern: matches value as word boundary OR value followed by optional space and unit
      return new RegExp(`(^|\\s|\\b)${escaped}(\\s*(gb|mb|tb|mp|mah|mhz|ghz|gen|inch|"|'|ram|rom|storage|battery|camera|processor)?|\\b)`, 'i');
    };
    
    // RAM filter - search in specifications array and variant attributes with flexible matching
    if (ram) {
      const ramRegex = createFlexibleRegex(ram);
      specFilters.push({
        $or: [
          { 'specifications': { $elemMatch: { key: { $regex: /^(ram|memory)$/i }, value: ramRegex } } },
          { 'variants': { $elemMatch: { 'attributes.RAM': ramRegex } } },
          { 'variants': { $elemMatch: { 'attributes.Memory': ramRegex } } },
          { 'variants': { $elemMatch: { 'attributes.ram': ramRegex } } },
          { 'variants': { $elemMatch: { 'attributes.memory': ramRegex } } }
        ]
      });
    }

    // ROM/Storage filter - flexible matching for storage values
    if (rom) {
      const romRegex = createFlexibleRegex(rom);
      specFilters.push({
        $or: [
          { 'specifications': { $elemMatch: { key: { $regex: /^(rom|storage)$/i }, value: romRegex } } },
          { 'variants': { $elemMatch: { 'attributes.ROM': romRegex } } },
          { 'variants': { $elemMatch: { 'attributes.Storage': romRegex } } },
          { 'variants': { $elemMatch: { 'attributes.rom': romRegex } } },
          { 'variants': { $elemMatch: { 'attributes.storage': romRegex } } }
        ]
      });
    }

    // Battery filter - flexible matching for battery capacity with "greater than or equal" logic
    if (battery) {
      // Extract numeric value from filter (e.g., "4000" from "4000mah+")
      const batteryNum = parseInt(battery);
      if (!isNaN(batteryNum)) {
        // Create regex that matches numbers >= batteryNum
        // Strategy: Match exact number OR numbers with same digits but higher first digit OR numbers with more digits
        const numStr = String(batteryNum);
        const numLength = numStr.length;
        const firstDigit = parseInt(numStr[0]);
        
        // Build pattern: exact match OR higher first digit OR more digits
        let batteryPattern;
        if (numLength === 1) {
          // Single digit: match the digit or higher, or 2+ digits
          batteryPattern = `([${batteryNum}-9]|\\d{2,})`;
        } else if (numLength === 2) {
          // Two digits: match exact or higher tens, or 3+ digits
          const secondDigit = parseInt(numStr[1]);
          if (secondDigit === 0) {
            batteryPattern = `([${firstDigit}-9]\\d|\\d{3,})`;
          } else {
            batteryPattern = `(${batteryNum}|[${Math.min(firstDigit + 1, 9)}-9]\\d|\\d{3,})`;
          }
        } else if (numLength === 3) {
          // Three digits: match exact or higher hundreds, or 4+ digits
          batteryPattern = `(${batteryNum}|[${Math.min(firstDigit + 1, 9)}-9]\\d{2}|\\d{4,})`;
        } else if (numLength === 4) {
          // Four digits (e.g., 4000): match 4000-9999 or 5+ digits
          // For 4000: match any 4-digit number starting with 4-9 OR any 5+ digit number
          // This covers: 4000, 5000, 6000, 7000, 8000, 9000, 10000, etc.
          batteryPattern = `([${firstDigit}-9]\\d{3}|\\d{5,})`;
        } else {
          // 5+ digits: match exact or higher
          batteryPattern = `(${batteryNum}|[${Math.min(firstDigit + 1, 9)}-9]\\d{${numLength - 1},}|\\d{${numLength + 1},})`;
        }
        
        // More permissive regex: match number anywhere in the string, with optional units
        const batteryRegex = new RegExp(`${batteryPattern}\\s*(mah|mAh|MAH|mAh|battery)?`, 'i');
        
        specFilters.push({
          $or: [
            { 'specifications': { $elemMatch: { key: { $regex: /^battery$/i }, value: batteryRegex } } },
            { 'variants': { $elemMatch: { 'attributes.Battery': batteryRegex } } },
            { 'variants': { $elemMatch: { 'attributes.battery': batteryRegex } } }
          ]
        });
      } else {
        // Fallback to flexible regex if not a number
        const batteryRegex = createFlexibleRegex(battery);
        specFilters.push({
          $or: [
            { 'specifications': { $elemMatch: { key: { $regex: /^battery$/i }, value: batteryRegex } } },
            { 'variants': { $elemMatch: { 'attributes.Battery': batteryRegex } } },
            { 'variants': { $elemMatch: { 'attributes.battery': batteryRegex } } }
          ]
        });
      }
    }

    // Processor filter - flexible matching for processor names (partial search)
    if (processor) {
      // For processor, use partial matching since names can be long
      const processorRegex = new RegExp(processor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      specFilters.push({
        $or: [
          { 'specifications': { $elemMatch: { key: { $regex: /^processor$/i }, value: processorRegex } } },
          { 'variants': { $elemMatch: { 'attributes.Processor': processorRegex } } },
          { 'variants': { $elemMatch: { 'attributes.processor': processorRegex } } }
        ]
      });
    }

    // Camera filter - flexible matching for camera MP values with "greater than or equal" logic
    if (camera) {
      // Extract numeric value from filter (e.g., "12" from "12+ MP")
      const cameraNum = parseInt(camera);
      if (!isNaN(cameraNum)) {
        // Create regex that matches numbers >= cameraNum
        const numStr = String(cameraNum);
        const numLength = numStr.length;
        const firstDigit = parseInt(numStr[0]);
        
        // Build pattern: exact match OR higher first digit OR more digits
        let cameraPattern;
        if (numLength === 1) {
          // Single digit: match the digit or higher, or 2+ digits
          cameraPattern = `([${cameraNum}-9]|\\d{2,})`;
        } else if (numLength === 2) {
          // Two digits (e.g., 12): match 12-99 or 3+ digits
          const secondDigit = parseInt(numStr[1]);
          if (secondDigit === 0) {
            // Exact tens (10, 20, etc.) - match that ten and above, or 3+ digits
            // For 10: match 10-99 OR 100+
            cameraPattern = `([${firstDigit}-9]\\d|\\d{3,})`;
          } else {
            // Non-tens (12, 24, etc.) - match exact or higher
            // For 12: match 12-19 OR 20-99 OR 100+
            if (firstDigit < 9) {
              // Match: exact number OR same first digit with higher second digit OR higher first digit OR 3+ digits
              cameraPattern = `(${cameraNum}|${firstDigit}[${secondDigit + 1}-9]|[${firstDigit + 1}-9]\\d|\\d{3,})`;
            } else {
              // For 90+: match exact or 3+ digits
              cameraPattern = `(${cameraNum}|\\d{3,})`;
            }
          }
        } else if (numLength === 3) {
          // Three digits (e.g., 108): match 108-999 or 4+ digits
          cameraPattern = `(${cameraNum}|[${Math.min(firstDigit + 1, 9)}-9]\\d{2}|\\d{4,})`;
        } else {
          // 4+ digits: match exact or higher
          cameraPattern = `(${cameraNum}|[${Math.min(firstDigit + 1, 9)}-9]\\d{${numLength - 1},}|\\d{${numLength + 1},})`;
        }
        
        // More permissive regex: match number anywhere in the string, with optional units
        const cameraRegex = new RegExp(`${cameraPattern}\\s*(mp|MP|Mp|megapixel|Megapixel|camera)?`, 'i');
        
        specFilters.push({
          $or: [
            { 'specifications': { $elemMatch: { key: { $regex: /^camera$/i }, value: cameraRegex } } },
            { 'variants': { $elemMatch: { 'attributes.Camera': cameraRegex } } },
            { 'variants': { $elemMatch: { 'attributes.camera': cameraRegex } } }
          ]
        });
      } else {
        // Fallback to flexible regex if not a number
        const cameraRegex = createFlexibleRegex(camera);
        specFilters.push({
          $or: [
            { 'specifications': { $elemMatch: { key: { $regex: /^camera$/i }, value: cameraRegex } } },
            { 'variants': { $elemMatch: { 'attributes.Camera': cameraRegex } } },
            { 'variants': { $elemMatch: { 'attributes.camera': cameraRegex } } }
          ]
        });
      }
    }

    // Resolution filter
    if (resolution) {
      specFilters.push({
        $or: [
          { 'specifications': { $elemMatch: { key: { $regex: /^resolution$/i }, value: { $regex: resolution, $options: 'i' } } } },
          { 'variants': { $elemMatch: { 'attributes.Resolution': { $regex: resolution, $options: 'i' } } } }
        ]
      });
    }

    // Screen Size filter - flexible matching for screen sizes like "13.6 inch", "13-14", etc.
    if (screenSize) {
      // Create flexible regex for screen size matching
      // e.g., "13" should match "13.6 inch", "13-14", "13 inch", etc.
      const screenSizeRegex = createFlexibleRegex(screenSize);
      specFilters.push({
        $or: [
          { 'specifications': { $elemMatch: { key: { $regex: /^(screen size|display size|display)$/i }, value: screenSizeRegex } } },
          { 'variants': { $elemMatch: { 'attributes.Screen Size': screenSizeRegex } } },
          { 'variants': { $elemMatch: { 'attributes.Display': screenSizeRegex } } },
          { 'variants': { $elemMatch: { 'attributes.screen size': screenSizeRegex } } },
          { 'variants': { $elemMatch: { 'attributes.display': screenSizeRegex } } }
        ]
      });
    }

    // Add specification filters to query
    if (specFilters.length > 0) {
      query.$and = query.$and || [];
      query.$and.push(...specFilters);
    }

    // Build sort object
    let sortObj = { createdAt: -1 }; // Default sort by newest
    if (sort) {
      switch (sort) {
        case 'price_asc':
          sortObj = { price: 1 };
          break;
        case 'price_desc':
          sortObj = { price: -1 };
          break;
        case 'name_asc':
          sortObj = { productName: 1 };
          break;
        case 'name_desc':
          sortObj = { productName: -1 };
          break;
        case 'rating_desc':
          sortObj = { averageRating: -1 };
          break;
        case 'newest':
          sortObj = { createdAt: -1 };
          break;
        case 'ram_asc':
        case 'ram_desc':
          // Sort by RAM - extract numeric value from specifications
          // This requires aggregation pipeline for proper sorting
          break;
        case 'battery_asc':
        case 'battery_desc':
          // Sort by Battery capacity
          break;
        default:
          sortObj = { createdAt: -1 };
      }
    }

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    // For specification-based sorting, use aggregation pipeline
    if (sort && ['ram_asc', 'ram_desc', 'rom_asc', 'rom_desc', 'battery_asc', 'battery_desc'].includes(sort)) {
      const sortField = sort.split('_')[0]; // ram, rom, battery
      const sortOrder = sort.split('_')[1] === 'asc' ? 1 : -1;
      
      // Build aggregation pipeline
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            // Extract numeric value from specifications for sorting
            sortValue: {
              $let: {
                vars: {
                  spec: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$specifications',
                          as: 'spec',
                          cond: {
                            $or: [
                              { $eq: [{ $toLower: '$$spec.key' }, sortField === 'ram' ? 'ram' : sortField === 'rom' ? 'rom' : 'battery'] },
                              { $eq: [{ $toLower: '$$spec.key' }, sortField === 'rom' ? 'storage' : ''] }
                            ]
                          }
                        }
                      },
                      0
                    ]
                  }
                },
                in: {
                  $toDouble: {
                    $arrayElemAt: [
                      {
                        $regexFind: {
                          input: '$$spec.value',
                          regex: /(\d+(?:\.\d+)?)/
                        }
                      },
                      1
                    ]
                  }
                }
              }
            }
          }
        },
        { $sort: { sortValue: sortOrder, createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $lookup: {
            from: 'subcategories',
            localField: 'subcategory',
            foreignField: '_id',
            as: 'subcategory'
          }
        },
        {
          $addFields: {
            category: { $arrayElemAt: ['$category', 0] },
            subcategory: { $arrayElemAt: ['$subcategory', 0] }
          }
        },
        { $project: { sortValue: 0 } } // Remove sortValue from output
      ];

      const products = await Product.aggregate(pipeline);
      const totalResult = await Product.aggregate([
        { $match: query },
        { $count: 'total' }
      ]);
      const total = totalResult[0]?.total || 0;

      // Calculate pagination info
      const totalPages = Math.ceil(total / limitNum);

      return res.json({ 
        success: true, 
        data: products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: totalPages
        }
      });
    }

    // Execute query for regular sorting
    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);

    res.json({ 
      success: true, 
      data: products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: totalPages
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: err.message });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const product = await Product.findById(id)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('reviews.user', 'displayName email name')
      .populate('frequentlyBoughtTogether', '_id productName price discountPrice sku images');
    
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    
    // Filter only active reviews
    const activeReviews = product.reviews.filter(review => review.isActive);
    
    // Get order-based reviews for this product with pagination
    const Rating = (await import('../../models/rating.js')).default;
    const orderReviews = await Rating.find({ 
      product: id, 
      isActive: true 
    })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

    // Combine both types of reviews
    const allReviews = [
      ...activeReviews.map(review => ({
        ...review.toObject(),
        reviewType: 'product',
        source: 'Direct Product Review'
      })),
      ...orderReviews.map(review => ({
        _id: review._id,
        user: review.user,
        rating: review.ratings.overall,
        title: review.title || `Order Review - ${new Date(review.createdAt).toLocaleDateString()}`,
        comment: review.comment,
        images: review.images || [],
        isVerified: true,
        helpful: review.helpful || [],
        helpfulCount: review.helpfulCount || 0,
        isActive: review.isActive,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        reviewType: 'order',
        source: 'Order Review'
      }))
    ];

    // Sort combined reviews by creation date (newest first)
    allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get total count of order reviews for pagination
    const totalOrderReviews = await Rating.countDocuments({ 
      product: id, 
      isActive: true 
    });

    // Get manual frequently bought together products if they exist
    let manualProducts = [];
    if (product.manualFrequentlyBoughtTogether) {
      manualProducts = Array.isArray(product.manualFrequentlyBoughtTogether) 
        ? product.manualFrequentlyBoughtTogether 
        : [];
    }
    
    // Filter out null values from populated frequentlyBoughtTogether (in case some products were deleted)
    const validFrequentlyBoughtTogether = (product.frequentlyBoughtTogether || []).filter(
      (item) => item !== null && item !== undefined
    );
    
    // Combine regular and manual frequently bought together products
    const allFrequentlyBoughtTogether = [
      ...validFrequentlyBoughtTogether,
      ...manualProducts
    ];

    // Create response with enhanced product data
    const productData = {
      ...product.toObject(),
      frequentlyBoughtTogether: allFrequentlyBoughtTogether,
      reviews: allReviews,
      reviewStats: {
        totalReviews: product.totalReviews + totalOrderReviews,
        averageRating: product.averageRating,
        ratingDistribution: product.ratingDistribution,
        verifiedReviews: activeReviews.filter(r => r.isVerified).length + totalOrderReviews,
        directReviews: activeReviews.length,
        orderReviews: totalOrderReviews
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalOrderReviews,
        pages: Math.ceil(totalOrderReviews / limit)
      }
    };

    res.json({ success: true, data: productData });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch product', error: err.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let updateData = req.body;
    
    // Handle images from middleware
    if (req.imageUrls && Array.isArray(req.imageUrls)) {
      updateData.images = req.imageUrls;
    }
    
    // Handle video files from middleware (multiple)
    if (req.productVideoUrls && Array.isArray(req.productVideoUrls)) {
      // Check if existing videos are being preserved
      let existingVideos = [];
      if (updateData.existingVideos && typeof updateData.existingVideos === 'string') {
        try {
          existingVideos = JSON.parse(updateData.existingVideos);
        } catch (error) {
        }
      } else if (Array.isArray(updateData.existingVideos)) {
        existingVideos = updateData.existingVideos;
      }
      
      // Merge existing videos with new ones
      updateData.productVideos = [...existingVideos, ...req.productVideoUrls];
      delete updateData.existingVideos; // Remove from update data
    } else if (updateData.existingVideos) {
      // Only existing videos, no new uploads
      if (typeof updateData.existingVideos === 'string') {
        try {
          updateData.productVideos = JSON.parse(updateData.existingVideos);
        } catch (error) {
        }
      } else if (Array.isArray(updateData.existingVideos)) {
        updateData.productVideos = updateData.existingVideos;
      }
      delete updateData.existingVideos;
    }
    
    // Parse YouTube video URLs from FormData
    if (updateData.youtubeVideoUrls && typeof updateData.youtubeVideoUrls === 'string') {
      try {
        updateData.youtubeVideoUrls = JSON.parse(updateData.youtubeVideoUrls);
      } catch (error) {
        updateData.youtubeVideoUrls = [];
      }
    }
    
    // Parse JSON fields from FormData
    if (updateData.variants && typeof updateData.variants === 'string') {
      try {
        updateData.variants = JSON.parse(updateData.variants);
      } catch (error) {
        updateData.variants = [];
      }
    }
    
    // Parse keyFeatures, whatsInBox, and specifications from FormData
    if (updateData.keyFeatures && typeof updateData.keyFeatures === 'string') {
      try {
        updateData.keyFeatures = JSON.parse(updateData.keyFeatures);
      } catch (error) {
        updateData.keyFeatures = [];
      }
    }
    
    if (updateData.whatsInBox && typeof updateData.whatsInBox === 'string') {
      try {
        updateData.whatsInBox = JSON.parse(updateData.whatsInBox);
      } catch (error) {
        updateData.whatsInBox = [];
      }
    }
    
    if (updateData.specifications && typeof updateData.specifications === 'string') {
      try {
        updateData.specifications = JSON.parse(updateData.specifications);
      } catch (error) {
        updateData.specifications = [];
      }
    }
    
    // Parse frequentlyBoughtTogether from FormData
    if (updateData.frequentlyBoughtTogether && typeof updateData.frequentlyBoughtTogether === 'string') {
      try {
        updateData.frequentlyBoughtTogether = JSON.parse(updateData.frequentlyBoughtTogether);
      } catch (error) {
        updateData.frequentlyBoughtTogether = [];
      }
    }
    
    // Handle manual product images from middleware
    let manualProductImageMap = {};
    if (req.manualProductImageUrls && Array.isArray(req.manualProductImageUrls)) {
      req.manualProductImageUrls.forEach((item) => {
        manualProductImageMap[item.index] = item.url;
      });
    }
    
    // Parse and handle manual frequently bought together products
    if (updateData.manualFrequentlyBoughtTogether && typeof updateData.manualFrequentlyBoughtTogether === 'string') {
      try {
        const manualProducts = JSON.parse(updateData.manualFrequentlyBoughtTogether);
        
        // Update manual products with uploaded image URLs
        if (Array.isArray(manualProducts)) {
          // Upload base64 images to Cloudinary
          for (let index = 0; index < manualProducts.length; index++) {
            const product = manualProducts[index];
            
            // If we have an uploaded image URL for this index, use it
            if (manualProductImageMap[index] !== undefined) {
              product.images = [manualProductImageMap[index]];
              console.log(`✅ Manual product ${index} image from file upload: ${manualProductImageMap[index]}`);
            } else if (product.imageBase64) {
              // Upload base64 image to Cloudinary
              try {
                const base64Data = product.imageBase64;
                // Remove data URL prefix if present
                const base64String = base64Data.includes(',') 
                  ? base64Data.split(',')[1] 
                  : base64Data;
                
                const uploadResult = await cloudinary.uploader.upload(
                  `data:image/jpeg;base64,${base64String}`,
                  {
                    folder: 'product/manual-products',
                    resource_type: 'image',
                    public_id: `manual-${Date.now()}-${index}`,
                  }
                );
                
                product.images = [uploadResult.secure_url];
                console.log(`✅ Manual product ${index} base64 image uploaded to Cloudinary: ${uploadResult.secure_url}`);
              } catch (error) {
                product.images = [];
              }
            } else {
              product.images = product.images || [];
            }
            // Remove temporary fields
            delete product.imageBase64;
          }
          
          // Store manual products
          updateData.manualFrequentlyBoughtTogether = manualProducts;
        }
      } catch (error) {
      }
    }
    
    // Convert numeric fields
    if (updateData.price) {
      updateData.price = parseFloat(updateData.price);
    }
    if (updateData.discountPrice) {
      updateData.discountPrice = parseFloat(updateData.discountPrice);
    }
    if (updateData.stock) {
      updateData.stock = parseInt(updateData.stock);
    }
    if (updateData.shipmentLength !== undefined) {
      updateData.shipmentLength = updateData.shipmentLength ? parseFloat(updateData.shipmentLength) : undefined;
    }
    if (updateData.shipmentWidth !== undefined) {
      updateData.shipmentWidth = updateData.shipmentWidth ? parseFloat(updateData.shipmentWidth) : undefined;
    }
    if (updateData.shipmentHeight !== undefined) {
      updateData.shipmentHeight = updateData.shipmentHeight ? parseFloat(updateData.shipmentHeight) : undefined;
    }
    if (updateData.shipmentWeight !== undefined) {
      updateData.shipmentWeight = updateData.shipmentWeight ? parseFloat(updateData.shipmentWeight) : undefined;
    }
    if (updateData.isActive !== undefined) {
      updateData.isActive = updateData.isActive === 'true';
    }
    if (updateData.isPreOrder !== undefined) {
      updateData.isPreOrder = updateData.isPreOrder === 'true' || updateData.isPreOrder === true;
    }
    
    // Get old product data to check for pre-order status change
    const oldProduct = await Product.findById(id);
    
    const product = await Product.findByIdAndUpdate(id, updateData, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    
    // Check if stock was updated and trigger stock monitoring
    if (updateData.stock !== undefined) {
      console.log(`📦 Stock updated for product ${product.productName}: ${updateData.stock}`);
      // Trigger immediate stock check
      try {
        await stockMonitoringService.checkProductStock(id);
      } catch (error) {
      }
    }
    
    // Check if pre-order product became available
    if (oldProduct && oldProduct.isPreOrder && 
        (updateData.isPreOrder === false || (updateData.stock !== undefined && updateData.stock > 0 && product.stock > 0))) {
      // Product is no longer pre-order or has stock - notify all registered users
      try {
        console.log(`🔔 Pre-order product ${product.productName} is now available! Notifying registered users...`);
        const pendingNotifications = await PreOrderNotification.find({
          product: id,
          status: 'pending'
        }).populate('product');

        for (const notification of pendingNotifications) {
          try {
            await sendPreOrderNotification(notification, product, 'available');
            notification.status = 'notified';
            notification.notified = true;
            notification.notifiedAt = new Date();
            await notification.save();
            console.log(`✅ Notification sent to ${notification.email}`);
          } catch (error) {
          }
        }
        console.log(`📧 Notified ${pendingNotifications.length} users about product availability`);
      } catch (error) {
        // Don't fail the request if notification fails
      }
    }
    
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update product', error: err.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete product', error: err.message });
  }
};

export const getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.query;
    if (!categoryId) {
      return res.status(400).json({ success: false, message: 'categoryId is required' });
    }
    const products = await Product.find({ category: categoryId })
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(8);
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: err.message });
  }
};

// Dynamic Variant Management APIs
export const getVariantAttributes = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Extract all unique attributes from variants
    const allAttributes = new Set();
    
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach(variant => {
        if (variant.attributes) {
          Object.keys(variant.attributes).forEach(attr => {
            allAttributes.add(attr);
          });
        }
      });
    }

    res.json({ 
      success: true, 
      data: {
        attributes: Array.from(allAttributes),
        variants: product.variants || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch variant attributes', error: err.message });
  }
};

export const updateVariantAttributes = async (req, res) => {
  try {
    const { productId } = req.params;
    const { attributes, variants } = req.body;

    if (!Array.isArray(attributes)) {
      return res.status(400).json({ success: false, message: 'Attributes must be an array' });
    }

    if (!Array.isArray(variants)) {
      return res.status(400).json({ success: false, message: 'Variants must be an array' });
    }

    // Validate variants structure
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      
      if (!variant.variantName) {
        return res.status(400).json({ 
          success: false, 
          message: `Variant ${i + 1} must have a variantName` 
        });
      }

      if (typeof variant.price !== 'number' || variant.price < 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Variant ${i + 1} must have a valid price` 
        });
      }

      if (typeof variant.stock !== 'number' || variant.stock < 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Variant ${i + 1} must have a valid stock quantity` 
        });
      }

      // Validate discount price
      if (variant.discountPrice !== undefined) {
        if (typeof variant.discountPrice !== 'number' || variant.discountPrice < 0) {
          return res.status(400).json({ 
            success: false, 
            message: `Variant ${i + 1} must have a valid discount price` 
          });
        }
        
        if (variant.discountPrice > variant.price) {
          return res.status(400).json({ 
            success: false, 
            message: `Variant ${i + 1} discount price cannot be higher than regular price` 
          });
        }
      }
    }

    const product = await Product.findByIdAndUpdate(
      productId,
      { 
        variants: variants,
        // Store the attribute configuration for future reference
        variantAttributeConfig: attributes
      },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ 
      success: true, 
      data: {
        message: 'Variant attributes updated successfully',
        product: product
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update variant attributes', error: err.message });
  }
};

export const generateVariantCombinations = async (req, res) => {
  try {
    const { productId } = req.params;
    const { attributes } = req.body;

    if (!attributes || !Array.isArray(attributes)) {
      return res.status(400).json({ success: false, message: 'Attributes array is required' });
    }

    // Generate all possible combinations of attributes
    const generateCombinations = (attrs) => {
      if (attrs.length === 0) return [{}];
      
      const [attrName, attrValues] = attrs[0];
      const remainingCombinations = generateCombinations(attrs.slice(1));
      const combinations = [];
      
      attrValues.forEach(value => {
        remainingCombinations.forEach(combo => {
          combinations.push({
            ...combo,
            [attrName]: value
          });
        });
      });
      
      return combinations;
    };

    // Convert attributes array to format: [['size', ['S', 'M', 'L']], ['color', ['Red', 'Blue']]]
    const attributeEntries = Object.entries(attributes);
    const combinations = generateCombinations(attributeEntries);

    // Create variant suggestions
    const variantSuggestions = combinations.map((combo, index) => {
      const variantName = Object.entries(combo)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      
      return {
        variantName: variantName,
        price: 0,
        stock: 0,
        sku: `VAR-${index + 1}`,
        attributes: combo
      };
    });

    res.json({ 
      success: true, 
      data: {
        combinations: combinations,
        variantSuggestions: variantSuggestions
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate variant combinations', error: err.message });
  }
};

export const bulkUpdateVariants = async (req, res) => {
  try {
    const { productId } = req.params;
    const { variants, updateType, value } = req.body;

    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ success: false, message: 'Variants array is required' });
    }

    if (!updateType || !['price', 'stock', 'discountPrice'].includes(updateType)) {
      return res.status(400).json({ success: false, message: 'Valid updateType is required (price, stock, discountPrice)' });
    }

    if (value === undefined || (typeof value === 'number' && value < 0)) {
      return res.status(400).json({ success: false, message: 'Valid value is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Update specified variants
    const updatedVariants = product.variants.map(variant => {
      const shouldUpdate = variants.some(v => v.sku === variant.sku || v.variantName === variant.variantName);
      
      if (shouldUpdate) {
        return {
          ...variant.toObject(),
          [updateType]: value
        };
      }
      return variant;
    });

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { variants: updatedVariants },
      { new: true }
    );

    res.json({ 
      success: true, 
      data: {
        message: `Bulk updated ${updateType} for ${variants.length} variants`,
        product: updatedProduct
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to bulk update variants', error: err.message });
  }
};

// SKU Validation API
export const validateSKU = async (req, res) => {
  try {
    const { sku, productId } = req.body;

    if (!sku) {
      return res.status(400).json({ success: false, message: 'SKU is required' });
    }

    // Build query to check for existing SKU
    let query = { sku: sku };
    
    // If updating a product, exclude the current product from the check
    if (productId) {
      query._id = { $ne: productId };
    }

    const existingProduct = await Product.findOne(query);
    const isAvailable = !existingProduct;

    res.json({ 
      success: true, 
      data: {
        sku: sku,
        isAvailable: isAvailable,
        message: isAvailable ? 'SKU is available' : 'SKU already exists'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to validate SKU', error: err.message });
  }
};

// Product Alerts API
export const getProductAlerts = async (req, res) => {
  try {
    const alerts = {
      lowStock: [],
      outOfStock: [],
      priceIssues: [],
      skuIssues: [],
      variantIssues: []
    };

    // Low stock products (below threshold)
    const lowStockProducts = await Product.find({
      stock: { $lt: 10 }, // Default threshold
      isActive: true
    }).populate('category', 'name').limit(20);

    alerts.lowStock = lowStockProducts.map(product => ({
      id: product._id,
      name: product.productName,
      sku: product.sku,
      currentStock: product.stock,
      category: product.category?.name,
      type: 'low_stock'
    }));

    // Out of stock products
    const outOfStockProducts = await Product.find({
      stock: 0,
      isActive: true
    }).populate('category', 'name').limit(20);

    alerts.outOfStock = outOfStockProducts.map(product => ({
      id: product._id,
      name: product.productName,
      sku: product.sku,
      category: product.category?.name,
      type: 'out_of_stock'
    }));

    // Price issues (discount price higher than regular price)
    const priceIssueProducts = await Product.find({
      $expr: { $gt: ['$discountPrice', '$price'] }
    }).populate('category', 'name').limit(20);

    alerts.priceIssues = priceIssueProducts.map(product => ({
      id: product._id,
      name: product.productName,
      sku: product.sku,
      price: product.price,
      discountPrice: product.discountPrice,
      category: product.category?.name,
      type: 'price_issue'
    }));

    // SKU issues (duplicate or invalid SKUs)
    const skuIssues = await Product.aggregate([
      {
        $group: {
          _id: '$sku',
          count: { $sum: 1 },
          products: { $push: '$$ROOT' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    alerts.skuIssues = skuIssues.map(group => ({
      sku: group._id,
      count: group.count,
      products: group.products.map(p => ({
        id: p._id,
        name: p.productName
      })),
      type: 'duplicate_sku'
    }));

    // Variant issues (variants with no stock or price issues)
    const productsWithVariants = await Product.find({
      'variants.0': { $exists: true }
    }).populate('category', 'name');

    productsWithVariants.forEach(product => {
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          if (variant.stock === 0) {
            alerts.variantIssues.push({
              id: product._id,
              name: product.productName,
              variantName: variant.variantName,
              sku: variant.sku,
              category: product.category?.name,
              type: 'variant_out_of_stock'
            });
          }
          
          if (variant.discountPrice && variant.discountPrice > variant.price) {
            alerts.variantIssues.push({
              id: product._id,
              name: product.productName,
              variantName: variant.variantName,
              sku: variant.sku,
              price: variant.price,
              discountPrice: variant.discountPrice,
              category: product.category?.name,
              type: 'variant_price_issue'
            });
          }
        });
      }
    });

    res.json({ 
      success: true, 
      data: {
        lowStock: alerts.lowStock,
        outOfStock: alerts.outOfStock,
        priceIssues: alerts.priceIssues,
        skuIssues: alerts.skuIssues,
        variantIssues: alerts.variantIssues,
        summary: {
          totalAlerts: alerts.lowStock.length + alerts.outOfStock.length + alerts.priceIssues.length + alerts.skuIssues.length + alerts.variantIssues.length,
          lowStock: alerts.lowStock.length,
          outOfStock: alerts.outOfStock.length,
          priceIssues: alerts.priceIssues.length,
          skuIssues: alerts.skuIssues.length,
          variantIssues: alerts.variantIssues.length
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get product alerts', error: err.message });
  }
};

// Product Statistics API
export const getProductStats = async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $facet: {
          totalProducts: [{ $count: 'count' }],
          activeProducts: [{ $match: { isActive: true } }, { $count: 'count' }],
          inactiveProducts: [{ $match: { isActive: false } }, { $count: 'count' }],
          productsWithVariants: [{ $match: { 'variants.0': { $exists: true } } }, { $count: 'count' }],
          lowStockProducts: [{ $match: { stock: { $lt: 10 } } }, { $count: 'count' }],
          outOfStockProducts: [{ $match: { stock: 0 } }, { $count: 'count' }],
          averagePrice: [{ $group: { _id: null, avg: { $avg: '$price' } } }],
          totalStock: [{ $group: { _id: null, total: { $sum: '$stock' } } }],
          categoryDistribution: [
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    const result = stats[0];
    
    res.json({ 
      success: true, 
      data: {
        totalProducts: result.totalProducts[0]?.count || 0,
        activeProducts: result.activeProducts[0]?.count || 0,
        inactiveProducts: result.inactiveProducts[0]?.count || 0,
        productsWithVariants: result.productsWithVariants[0]?.count || 0,
        lowStockProducts: result.lowStockProducts[0]?.count || 0,
        outOfStockProducts: result.outOfStockProducts[0]?.count || 0,
        averagePrice: result.averagePrice[0]?.avg || 0,
        totalStock: result.totalStock[0]?.total || 0,
        categoryDistribution: result.categoryDistribution
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get product stats', error: err.message });
  }
};

// Bulk Product Operations API
export const bulkUpdateProducts = async (req, res) => {
  try {
    const { productIds, updateData, operation } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Product IDs array is required' });
    }

    if (!operation || !['activate', 'deactivate', 'update', 'delete'].includes(operation)) {
      return res.status(400).json({ success: false, message: 'Valid operation is required' });
    }

    let result;

    switch (operation) {
      case 'activate':
        result = await Product.updateMany(
          { _id: { $in: productIds } },
          { isActive: true }
        );
        break;
      
      case 'deactivate':
        result = await Product.updateMany(
          { _id: { $in: productIds } },
          { isActive: false }
        );
        break;
      
      case 'update':
        if (!updateData) {
          return res.status(400).json({ success: false, message: 'Update data is required' });
        }
        result = await Product.updateMany(
          { _id: { $in: productIds } },
          updateData
        );
        break;
      
      case 'delete':
        result = await Product.deleteMany({ _id: { $in: productIds } });
        break;
    }

    res.json({ 
      success: true, 
      data: {
        message: `Bulk ${operation} completed successfully`,
        modifiedCount: result.modifiedCount || result.deletedCount,
        totalProducts: productIds.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to bulk update products', error: err.message });
  }
};

 