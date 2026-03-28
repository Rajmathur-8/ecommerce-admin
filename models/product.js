import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  variantName: { type: String, required: true },
  image: { type: String },
  sku: { type: String },
  stock: { type: Number, default: 0 },
  price: { type: Number, required: true },
  discountPrice: { type: Number },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} }, // Dynamic attributes
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, required: true, maxlength: 100 },
  comment: { type: String, required: true, maxlength: 1000 },
  images: [{ type: String }],
  isVerified: { type: Boolean, default: false },
  helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  helpfulCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  productTitle: { type: String, required: true },
  productDescription: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory', required: true },
  sku: { type: String },
  unit: { type: String },
  price: { type: Number },
  discountPrice: { type: Number },
  stock: { type: Number, default: 0 },
  // Stock alert settings
  lowStockThreshold: { type: Number, default: 10 },
  stockAlertEnabled: { type: Boolean, default: true },
  lastStockAlertSent: { type: Date },
  modelNumber: { type: String },
  brandName: { type: String },
  manufacturerPartNumber: { type: String },
  eanCode: { type: String },
  suggestedPricing: {
    amazonPrice: { type: Number },
    flipkartPrice: { type: Number },
    suggestedPrice: { type: Number }
  },
  images: [{ type: String }],
  splineModelUrl: { type: String }, // 3D model URL (Spline)
  youtubeVideoUrls: [{ type: String }], // Array of YouTube video URLs
  productVideos: [{ type: String }], // Array of uploaded video file URLs
  variants: [variantSchema],
  variantAttributeConfig: [{ type: String }], // Store configured attributes
  keyFeatures: [{ type: String }], // Array of key features
  whatsInBox: [{ type: String }], // Array of items in the box
  specifications: [{ 
    key: { type: String, required: true },
    value: { type: String, required: true }
  }], // Array of specifications as key-value pairs
  frequentlyBoughtTogether: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product' 
  }], // Array of product IDs that are frequently bought together
  manualFrequentlyBoughtTogether: [{ 
    type: mongoose.Schema.Types.Mixed 
  }], // Array of manual product objects (not in Product collection)
  // Shipment dimensions and weight
  shipmentLength: { type: Number, min: 0 }, // in cm
  shipmentWidth: { type: Number, min: 0 }, // in cm
  shipmentHeight: { type: Number, min: 0 }, // in cm
  shipmentWeight: { type: Number, min: 0 }, // in kg
  isActive: { type: Boolean, default: true },
  isPreOrder: { type: Boolean, default: false }, // Pre-order product flag
  // Review system fields
  reviews: [reviewSchema],
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  totalReviews: { type: Number, default: 0 },
  ratingDistribution: {
    fiveStar: { type: Number, default: 0 },
    fourStar: { type: Number, default: 0 },
    threeStar: { type: Number, default: 0 },
    twoStar: { type: Number, default: 0 },
    oneStar: { type: Number, default: 0 }
  }
}, { timestamps: true });

// Pre-save middleware to calculate average rating and update rating distribution
productSchema.pre('save', function(next) {
  if (this.reviews && this.reviews.length > 0) {
    const activeReviews = this.reviews.filter(review => review.isActive);
    this.totalReviews = activeReviews.length;
    
    if (this.totalReviews > 0) {
      const totalRating = activeReviews.reduce((sum, review) => sum + review.rating, 0);
      this.averageRating = Math.round((totalRating / this.totalReviews) * 10) / 10;
      
      // Reset rating distribution
      this.ratingDistribution = {
        fiveStar: 0,
        fourStar: 0,
        threeStar: 0,
        twoStar: 0,
        oneStar: 0
      };
      
      // Calculate rating distribution
      activeReviews.forEach(review => {
        switch (review.rating) {
          case 5:
            this.ratingDistribution.fiveStar++;
            break;
          case 4:
            this.ratingDistribution.fourStar++;
            break;
          case 3:
            this.ratingDistribution.threeStar++;
            break;
          case 2:
            this.ratingDistribution.twoStar++;
            break;
          case 1:
            this.ratingDistribution.oneStar++;
            break;
        }
      });
    } else {
      this.averageRating = 0;
      this.ratingDistribution = {
        fiveStar: 0,
        fourStar: 0,
        threeStar: 0,
        twoStar: 0,
        oneStar: 0
      };
    }
  } else {
    this.averageRating = 0;
    this.totalReviews = 0;
    this.ratingDistribution = {
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0
    };
  }
  next();
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

export default Product; 