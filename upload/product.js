import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Check if it's a video file
    const isVideo = file.mimetype && file.mimetype.startsWith('video/');
    return {
      folder: 'product',
      resource_type: isVideo ? 'video' : 'auto',
      allowedFormats: isVideo 
        ? ['mp4', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv']
        : ['jpeg', 'jpg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'jfif', 'pdf', 'docx', 'doc', 'xlsx', 'ppt', 'pptx'],
      public_id: `${Date.now()}-${file.originalname}`,
    };
  },
});

const uploadProduct = (req, res, next) => {
  // Track total size of all files
  let totalSize = 0;
  const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB total limit
  
  // Use .any() to accept all file fields, then filter and validate manually
  const upload = multer({
    storage: storage,
    limits: { 
      fileSize: 5 * 1024 * 1024, // 5MB per file max
      files: 100 // Max total files
    },
    fileFilter: (req, file, cb) => {
      // Validate video files
      if (file.fieldname === 'productVideos') {
        if (file.mimetype && file.mimetype.startsWith('video/')) {
          // Video files: 5MB limit
          if (file.size && file.size > 5 * 1024 * 1024) {
            cb(new Error('Video file size too large. Max size is 5MB per video.'));
            return;
          }
          cb(null, true);
        } else {
          cb(new Error('Only video files are allowed for productVideos field'));
        }
      } else {
        // Images: 5MB limit per file
        if (file.size && file.size > 5 * 1024 * 1024) {
          cb(new Error(`File size too large. Max size is 5MB per file. Current: ${(file.size / 1024 / 1024).toFixed(2)}MB`));
          return;
        }
        cb(null, true);
      }
    }
  }).any(); // Accept any field name

  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const fieldName = err.field || 'file';
        if (fieldName === 'productVideos') {
          return res.status(400).json({ status: 'error', message: 'Video file size too large. Max size is 5MB per video.' });
        }
        return res.status(400).json({ status: 'error', message: 'File size too large. Max size is 5MB per file.' });
      }
      return res.status(500).json({ status: 'error', message: err.message });
    }

    // Organize files by fieldname since .any() returns an array
    const files = req.files || [];
    
    // Calculate total size of all uploaded files
    totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    
    // Check total size limit
    if (totalSize > MAX_TOTAL_SIZE) {
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
      return res.status(400).json({ 
        status: 'error', 
        message: `Total upload size (${totalSizeMB}MB) exceeds maximum limit of 5MB. Please reduce file sizes.` 
      });
    }

    const filesByField = {};
    
    files.forEach(file => {
      if (!filesByField[file.fieldname]) {
        filesByField[file.fieldname] = [];
      }
      filesByField[file.fieldname].push(file);
    });

    // All files are automatically uploaded to Cloudinary via CloudinaryStorage
    // file.path contains the Cloudinary URL
    
    // Handle product images (saved to Cloudinary)
    const imageUrls = [];
    if (filesByField['images']) {
      for (const file of filesByField['images']) {
        // file.path contains Cloudinary URL
        imageUrls.push(file.path);
        console.log(`✅ Product image uploaded to Cloudinary: ${file.path}`);
      }
    }
    if (imageUrls.length > 0) {
      req.imageUrls = imageUrls; 
    }
    
    // Handle video files (saved to Cloudinary)
    const videoUrls = [];
    if (filesByField['productVideos']) {
      for (const file of filesByField['productVideos']) {
        // file.path contains Cloudinary URL
        videoUrls.push(file.path);
        console.log(`✅ Video uploaded to Cloudinary: ${file.path}`);
      }
    }
    if (videoUrls.length > 0) {
      req.productVideoUrls = videoUrls;
    }
    
    // Handle variant images (saved to Cloudinary)
    const variantImageUrls = [];
    const variantImageIndices = req.body?.variantImageIndices ? 
      (Array.isArray(req.body.variantImageIndices) ? req.body.variantImageIndices : [req.body.variantImageIndices]) : [];
    
    if (filesByField['variantImages']) {
      for (let i = 0; i < filesByField['variantImages'].length; i++) {
        const file = filesByField['variantImages'][i];
        const index = variantImageIndices[i];
        // file.path contains Cloudinary URL
        variantImageUrls.push({
          index: index !== undefined ? parseInt(index) : i,
          url: file.path
        });
        console.log(`✅ Variant image ${index} uploaded to Cloudinary: ${file.path}`);
      }
    }
    if (variantImageUrls.length > 0) {
      req.variantImageUrls = variantImageUrls;
    }
    
    // Handle manual product images for frequently bought together (saved to Cloudinary)
    const manualProductImageUrls = [];
    const manualProductImageIndices = req.body?.manualProductImageIndex ? 
      (Array.isArray(req.body.manualProductImageIndex) ? req.body.manualProductImageIndex : [req.body.manualProductImageIndex]) : [];
    
    if (filesByField['manualProductImages']) {
      for (let i = 0; i < filesByField['manualProductImages'].length; i++) {
        const file = filesByField['manualProductImages'][i];
        const index = manualProductImageIndices[i] !== undefined ? parseInt(manualProductImageIndices[i]) : i;
        // file.path contains Cloudinary URL
        manualProductImageUrls.push({
          index: index,
          url: file.path
        });
        console.log(`✅ Manual product image ${index} uploaded to Cloudinary: ${file.path}`);
      }
    }
    if (manualProductImageUrls.length > 0) {
      req.manualProductImageUrls = manualProductImageUrls;
    }
    
    console.log(`📤 Total ${files.length} files uploaded to Cloudinary successfully`);
    
    next();
  });
};

export default uploadProduct; 