import multer from 'multer';
import csv from 'csv-parser';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import ProductModel from '../../models/product.js';
import CategoryModel from '../../models/category.js';
import SubcategoryModel from '../../models/subcategory.js';

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/temp';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Generate unique SKU
const generateSKU = async (productName, categoryName) => {
  const prefix = categoryName ? categoryName.substring(0, 3).toUpperCase() : 'PROD';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  const sku = `${prefix}-${timestamp}-${random}`;
  
  // Check if SKU already exists
  const existingProduct = await ProductModel.findOne({ sku });
  if (existingProduct) {
    return generateSKU(productName, categoryName); // Recursive call if SKU exists
  }
  
  return sku;
};

// Parse CSV file
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};

// Parse Excel file
const parseExcel = (filePath) => {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    return data;
  } catch (error) {
    throw new Error('Error parsing Excel file: ' + error.message);
  }
};

// Parse specifications from string format
const parseSpecifications = (specsString) => {
  try {
    // Try to parse as JSON first
    if (specsString.startsWith('[') || specsString.startsWith('{')) {
      const parsed = JSON.parse(specsString);
      if (Array.isArray(parsed)) {
        return parsed.filter(spec => spec.key && spec.value);
      }
    }
    
    // Parse as comma-separated key:value pairs
    const specs = specsString.split(',').map(spec => {
      const [key, value] = spec.split(':').map(s => s.trim());
      return { key, value };
    }).filter(spec => spec.key && spec.value);
    
    return specs;
  } catch (error) {
    return [];
  }
};


// Validate product data
const validateProductData = (data) => {
  const errors = [];
  const requiredFields = ['productName', 'price', 'category'];
  
  requiredFields.forEach(field => {
    if (!data[field] || data[field].toString().trim() === '') {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  // Validate price
  if (data.price && isNaN(parseFloat(data.price))) {
    errors.push('Invalid price format');
  }
  
  // Validate stock
  if (data.stock && isNaN(parseInt(data.stock))) {
    errors.push('Invalid stock format');
  }
  
  // Validate discount price
  if (data.discountPrice && isNaN(parseFloat(data.discountPrice))) {
    errors.push('Invalid discount price format');
  }
  
  return errors;
};

// Bulk import products
export const bulkImportProducts = async (req, res) => {
  try {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      const filePath = req.file.path;
      const fileExtension = path.extname(req.file.originalname).toLowerCase();
      
      let productsData;
      
      try {
        // Parse file based on extension
        if (fileExtension === '.csv') {
          productsData = await parseCSV(filePath);
        } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
          productsData = await parseExcel(filePath);
        } else {
          throw new Error('Unsupported file format');
        }
      } catch (parseError) {
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        return res.status(400).json({
          success: false,
          message: 'Error parsing file: ' + parseError.message
        });
      }

      if (!productsData || productsData.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({
          success: false,
          message: 'No data found in file'
        });
      }

      const results = {
        total: productsData.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process each product
      for (let i = 0; i < productsData.length; i++) {
        const row = productsData[i];
        const rowNumber = i + 2; // +2 because Excel/CSV starts from row 2 (row 1 is header)
        
        try {
          // Validate data
          const validationErrors = validateProductData(row);
          if (validationErrors.length > 0) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              errors: validationErrors,
              data: row
            });
            continue;
          }

          // Find category by name
          let category = null;
          if (row.category) {
            category = await CategoryModel.findOne({
              name: { $regex: new RegExp(row.category, 'i') }
            });
            
            if (!category) {
              results.failed++;
              results.errors.push({
                row: rowNumber,
                errors: [`Category not found: ${row.category}`],
                data: row
              });
              continue;
            }
          }

          // Find or create subcategory
          let subcategory = null;
          
          // If subcategory name is provided, try to find it
          if (row.subcategory && category) {
            subcategory = await SubcategoryModel.findOne({
              name: { $regex: new RegExp(row.subcategory, 'i') },
              category: category._id
            });
          }
          
          // If no subcategory found, try to get the first subcategory for this category
          if (!subcategory && category) {
            subcategory = await SubcategoryModel.findOne({
              category: category._id
            });
          }
          
          // If still no subcategory, create a default one
          if (!subcategory && category) {
            const defaultName = `${category.name}`; // Use category name as subcategory name
            subcategory = await SubcategoryModel.findOne({
              name: defaultName,
              category: category._id
            });
            
            // If it still doesn't exist, create it
            if (!subcategory) {
              subcategory = new SubcategoryModel({
                name: defaultName,
                category: category._id,
                isActive: true
              });
              await subcategory.save();
            }
          }
          
          // Final check: if no subcategory could be created or found, skip this product
          if (!subcategory) {
            results.failed++;
            results.errors.push({
              row: rowNumber,
              errors: [`No valid subcategory found or could be created for category: ${category?.name || 'Unknown'}`],
              data: row
            });
            continue;
          }

          // Generate SKU if not provided
          let sku = row.sku;
          if (!sku) {
            sku = await generateSKU(row.productName, category?.name);
          } else {
            // Check if SKU already exists
            const existingProduct = await ProductModel.findOne({ sku });
            if (existingProduct) {
              results.failed++;
              results.errors.push({
                row: rowNumber,
                errors: [`SKU already exists: ${sku}`],
                data: row
              });
              continue;
            }
          }

          // Prepare product data
          const productData = {
            productName: row.productName.trim(),
            productTitle: row.productTitle?.trim() || row.productName.trim(),
            productDescription: row.productDescription?.trim() || '',
            category: category._id,
            subcategory: subcategory?._id,
            sku: sku,
            unit: row.unit?.trim() || 'piece',
            price: parseFloat(row.price),
            discountPrice: row.discountPrice ? parseFloat(row.discountPrice) : undefined,
            stock: row.stock ? parseInt(row.stock) : 0,
            images: row.images ? row.images.split(',').map(img => img.trim()) : [],
            isActive: row.isActive !== undefined ? row.isActive.toString().toLowerCase() === 'true' : true,
            // 3D Model field
            splineModelUrl: row.splineModelUrl?.trim() || '',
            // Video fields
            youtubeVideoUrls: (() => {
              if (!row.youtubeVideoUrls) return [];
              try {
                // Try to parse as JSON array first
                if (row.youtubeVideoUrls.trim().startsWith('[')) {
                  return JSON.parse(row.youtubeVideoUrls);
                }
                // Otherwise, treat as comma-separated URLs
                return row.youtubeVideoUrls.split(',').map(url => url.trim()).filter(url => url);
              } catch (error) {
                return [];
              }
            })(),
            productVideos: row.productVideos ? row.productVideos.split(',').map(v => v.trim()).filter(v => v) : [],
            modelNumber: row.modelNumber?.trim() || '',
            brandName: row.brandName?.trim() || '',
            manufacturerPartNumber: row.manufacturerPartNumber?.trim() || '',
            // Product details
            keyFeatures: row.keyFeatures ? row.keyFeatures.split(',').map(f => f.trim()).filter(f => f) : [],
            whatsInBox: row.whatsInBox ? row.whatsInBox.split(',').map(w => w.trim()).filter(w => w) : [],
            specifications: row.specifications ? parseSpecifications(row.specifications) : [],
            // Shipment fields
            shipmentLength: row.shipmentLength ? parseFloat(row.shipmentLength) : undefined,
            shipmentWidth: row.shipmentWidth ? parseFloat(row.shipmentWidth) : undefined,
            shipmentHeight: row.shipmentHeight ? parseFloat(row.shipmentHeight) : undefined,
            shipmentWeight: (() => {
              if (!row.shipmentWeight) return undefined;
              let weight = parseFloat(row.shipmentWeight);
              // Check if unit is specified in shipmentWeightUnit column, or detect from value
              // If shipmentWeightUnit is 'gm', convert to kg
              if (row.shipmentWeightUnit && row.shipmentWeightUnit.toLowerCase().trim() === 'gm') {
                weight = weight / 1000; // Convert gm to kg
              }
              // If no unit specified but value is very large (> 1000), assume it's in gm
              else if (!row.shipmentWeightUnit && weight > 1000) {
                weight = weight / 1000; // Convert gm to kg
              }
              return weight;
            })()
          };

          // Handle variants if present
          if (row.variants) {
            try {
              const variantsData = JSON.parse(row.variants);
              if (Array.isArray(variantsData)) {
                productData.variants = variantsData.map(variant => ({
                  variantName: variant.variantName || variant.name || 'Default',
                  image: variant.image || '',
                  sku: variant.sku || `${sku}-${variant.variantName || 'VAR'}`,
                  stock: variant.stock ? parseInt(variant.stock) : 0,
                  price: parseFloat(variant.price) || parseFloat(row.price),
                  discountPrice: variant.discountPrice ? parseFloat(variant.discountPrice) : undefined,
                  attributes: variant.attributes || {}
                }));
              }
            } catch (variantError) {
              // If variant parsing fails, continue without variants
              console.log(`Variant parsing failed for row ${rowNumber}:`, variantError.message);
            }
          }

          // Handle frequentlyBoughtTogether if present
          if (row.frequentlyBoughtTogether) {
            try {
              // Can be comma-separated product IDs or JSON array
              let productIds = [];
              if (row.frequentlyBoughtTogether.trim().startsWith('[')) {
                // JSON array format
                productIds = JSON.parse(row.frequentlyBoughtTogether);
              } else {
                // Comma-separated format
                productIds = row.frequentlyBoughtTogether.split(',').map(id => id.trim()).filter(id => id);
              }
              
              // Validate that these product IDs exist
              if (productIds.length > 0) {
                const existingProducts = await ProductModel.find({ _id: { $in: productIds } }).select('_id');
                const validIds = existingProducts.map(p => p._id);
                productData.frequentlyBoughtTogether = validIds;
              }
            } catch (fbtError) {
              console.log(`Frequently Bought Together parsing failed for row ${rowNumber}:`, fbtError.message);
              // Continue without frequentlyBoughtTogether if parsing fails
            }
          }

          // Create product
          const product = new ProductModel(productData);
          await product.save();
          
          results.successful++;
          
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            errors: [error.message],
            data: row
          });
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      res.status(200).json({
        success: true,
        message: 'Bulk import completed',
        data: results
      });
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get import template
export const getImportTemplate = async (req, res) => {
  try {
    const template = [
      {
        productName: 'Sample Product',
        productTitle: 'Sample Product - Premium Quality',
        productDescription: 'This is a sample product description',
        category: 'Mobile',
        subcategory: 'Smartphones',
        sku: 'MOB-123456-ABC',
        unit: 'piece',
        price: '999.99',
        discountPrice: '899.99',
        stock: '50',
        images: 'image1.jpg,image2.jpg',
        isActive: 'true',
        splineModelUrl: 'https://prod.spline.design/ypAIlAtpoKQ-4LGI/scene.splinecode',
        brandName: 'Sample Brand',
        modelNumber: 'SAMPLE-001',
        shipmentLength: '30.5',
        shipmentWidth: '20.3',
        shipmentHeight: '15.2',
        shipmentWeight: '1.5',
        shipmentWeightUnit: 'kg',
        youtubeVideoUrls: 'https://www.youtube.com/watch?v=example1,https://www.youtube.com/watch?v=example2',
        productVideos: 'https://cloudinary.com/video1.mp4,https://cloudinary.com/video2.mp4',
        frequentlyBoughtTogether: 'PRODUCT_ID_1,PRODUCT_ID_2',
        manufacturerPartNumber: 'SMP-001-A',
        variants: JSON.stringify([
          {
            variantName: 'Sample Product - Premium Quality (128GB) Red',
            sku: 'MOB-123456-ABC-RED',
            stock: '25',
            price: '999.99',
            discountPrice: '899.99',
            attributes: {
              size: '128GB',
              color: 'Red'
            }
          },
          {
            variantName: 'Sample Product - Premium Quality (256GB) Blue',
            sku: 'MOB-123456-ABC-BLUE',
            stock: '25',
            price: '1099.99',
            discountPrice: '999.99',
            attributes: {
              size: '256GB',
              color: 'Blue'
            }
          }
        ]),
        keyFeatures: 'Feature 1,Feature 2,Feature 3',
        whatsInBox: 'Item 1,Item 2,Item 3',
        specifications: 'Color:Red,Size:Large,Weight:500g'
      }
    ];

    // Create CSV template
    const csvContent = [
      Object.keys(template[0]).join(','),
      Object.values(template[0]).map(value => `"${value}"`).join(',')
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product_import_template.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get categories for import
export const getCategoriesForImport = async (req, res) => {
  try {
    const categories = await CategoryModel.find({}, 'name');
    const subcategories = await SubcategoryModel.find({}, 'name category')
      .populate('category', 'name');

    res.status(200).json({
      success: true,
      data: {
        categories: categories.map(cat => cat.name),
        subcategories: subcategories.map(sub => ({
          name: sub.name,
          category: sub.category.name
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Export all products to CSV
export const exportProducts = async (req, res) => {
  try {
    const products = await ProductModel.find({})
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .lean();

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No products found to export'
      });
    }

    // Transform products to CSV format
    const csvData = products.map(product => {
      const categoryName = product.category?.name || product.category || '';
      const subcategoryName = product.subcategory?.name || product.subcategory || '';
      
      return {
        productName: product.productName || '',
        productTitle: product.productTitle || '',
        productDescription: product.productDescription || '',
        category: categoryName,
        subcategory: subcategoryName,
        sku: product.sku || '',
        unit: product.unit || '',
        price: product.price || 0,
        discountPrice: product.discountPrice || '',
        stock: product.stock || 0,
        brandName: product.brandName || '',
        modelNumber: product.modelNumber || '',
        manufacturerPartNumber: product.manufacturerPartNumber || '',
        eanCode: product.eanCode || '',
        splineModelUrl: product.splineModelUrl || '',
        keyFeatures: product.keyFeatures ? product.keyFeatures.join(',') : '',
        whatsInBox: product.whatsInBox ? product.whatsInBox.join(',') : '',
        specifications: product.specifications ? product.specifications.map(s => `${s.key}:${s.value}`).join(',') : '',
        isActive: product.isActive ? 'true' : 'false',
        images: product.images ? product.images.join('|') : '',
        variants: product.variants && product.variants.length > 0 
          ? JSON.stringify(product.variants.map(v => ({
              variantName: v.variantName,
              price: v.price,
              discountPrice: v.discountPrice,
              stock: v.stock,
              sku: v.sku,
              image: v.image || '',
              attributes: v.attributes || {}
            })))
          : ''
      };
    });

    // Convert to CSV
    const headers = Object.keys(csvData[0]);
    const csvRows = [
      headers.join(','),
      ...csvData.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Escape quotes and wrap in quotes if contains comma, newline, or quote
          if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="products_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to export products',
      error: error.message
    });
  }
};

// Get product count
export const getProductCount = async (req, res) => {
  try {
    const totalProducts = await ProductModel.countDocuments({});
    const activeProducts = await ProductModel.countDocuments({ isActive: true });
    const inactiveProducts = await ProductModel.countDocuments({ isActive: false });

    res.status(200).json({
      success: true,
      data: {
        total: totalProducts,
        active: activeProducts,
        inactive: inactiveProducts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get product count',
      error: error.message
    });
  }
};
