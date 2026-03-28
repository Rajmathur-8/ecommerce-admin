import mongoose from 'mongoose';

const promoSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  minimumAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  maximumDiscount: {
    type: Number,
    min: 0
  },
  usageLimit: {
    type: Number,
    min: 0
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  applicableUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isOneTimeUse: {
    type: Boolean,
    default: false
  },
  image: {
    type: String
  },
  priority: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Index for better query performance
// Note: code has unique: true which already creates an index
promoSchema.index({ isActive: 1 });
promoSchema.index({ validUntil: 1 });

// Method to check if promo is valid
promoSchema.methods.isValid = function() {
  const now = new Date();
  
  if (!this.isActive) return false;
  if (this.validUntil && now > this.validUntil) return false;
  if (this.validFrom && now < this.validFrom) return false;
  if (this.usageLimit && this.usedCount >= this.usageLimit) return false;
  
  return true;
};

// Method to calculate discount amount
promoSchema.methods.calculateDiscount = function(orderAmount) {
  if (orderAmount < this.minimumAmount) {
    return 0;
  }
  
  let discount = 0;
  
  if (this.type === 'percentage') {
    discount = (orderAmount * this.value) / 100;
  } else if (this.type === 'fixed') {
    discount = this.value;
  }
  
  if (this.maximumDiscount && discount > this.maximumDiscount) {
    discount = this.maximumDiscount;
  }
  
  return Math.min(discount, orderAmount);
};

const Promo = mongoose.models.Promo || mongoose.model('Promo', promoSchema);

export default Promo;

