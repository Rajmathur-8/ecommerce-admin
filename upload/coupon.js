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
    return {
      folder: 'coupon',
      resource_type: 'auto',
      allowedFormats: [
        'jpeg', 'jpg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'jfif',
        'pdf', 'docx', 'doc', 'xlsx', 'ppt', 'pptx'
      ],
      public_id: `${Date.now()}-${file.originalname}`,
    };
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: 'image', maxCount: 1 },  
]);

const uploadCoupon = (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ status: 'error', message: 'File size too large. Max size is 10MB.' });
      }
      return res.status(500).json({ status: 'error', message: err.message });
    }

    const files = req.files;
    const imageUrls = {};
    
    console.log('📤 Coupon upload middleware - files received:', {
      hasFiles: !!files,
      fileKeys: files ? Object.keys(files) : [],
      imageFile: files?.['image']?.[0] ? {
        fieldname: files['image'][0].fieldname,
        originalname: files['image'][0].originalname,
        path: files['image'][0].path,
        size: files['image'][0].size
      } : null
    });
    
    if (files?.['image']?.[0]) {
      imageUrls.image = files['image'][0].path;
      console.log('✅ Coupon image URL set:', files['image'][0].path);
    } else {
      console.log('⚠️ No image file found in upload');
    }
    
    if (Object.keys(imageUrls).length > 0) {
      req.imageUrls = imageUrls;
      console.log('✅ req.imageUrls set:', req.imageUrls);
    } else {
      console.log('⚠️ req.imageUrls not set (no images uploaded)');
    }
    
    next();
  });
};

export default uploadCoupon; 