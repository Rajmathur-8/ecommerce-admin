import mongoose from 'mongoose';

const ratingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  ratings: {
    overall: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    valueForMoney: {
      type: Number,
      required: false,
      min: 1,
      max: 5,
      default: null
    },
    quality: {
      type: Number,
      required: false,
      min: 1,
      max: 5,
      default: null
    },
    delivery: {
      type: Number,
      required: false,
      min: 1,
      max: 5,
      default: null
    },
    packaging: {
      type: Number,
      required: false,
      min: 1,
      max: 5,
      default: null
    },
    customerService: {
      type: Number,
      required: false,
      min: 1,
      max: 5,
      default: null
    }
  },
  title: {
    type: String,
    required: false,
    trim: true,
    maxlength: 100
  },
  comment: {
    type: String,
    required: true,
    trim: true
  },
  images: [{
    type: String, // URLs to uploaded images
    default: []
  }],
  videos: [{
    type: String, // URLs to uploaded videos
    default: []
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  helpful: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  helpfulCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for better query performance
ratingSchema.index({ user: 1, order: 1 }, { unique: true });
ratingSchema.index({ product: 1, createdAt: -1 });
ratingSchema.index({ isActive: 1 });

// Calculate average rating
ratingSchema.virtual('averageRating').get(function() {
  const ratings = this.ratings;
  const validRatings = [ratings.overall];
  
  if (ratings.valueForMoney) validRatings.push(ratings.valueForMoney);
  if (ratings.quality) validRatings.push(ratings.quality);
  if (ratings.delivery) validRatings.push(ratings.delivery);
  if (ratings.packaging) validRatings.push(ratings.packaging);
  if (ratings.customerService) validRatings.push(ratings.customerService);
  
  const total = validRatings.reduce((sum, rating) => sum + rating, 0);
  return (total / validRatings.length).toFixed(1);
});

const Rating = mongoose.model('Rating', ratingSchema);

export default Rating; 