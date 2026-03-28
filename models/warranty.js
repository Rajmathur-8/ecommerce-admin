import mongoose from 'mongoose';

const warrantySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  duration: {
    type: Number,
    required: true,
    min: 1 // Duration in months
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  coverage: [{
    type: String,
    trim: true
  }], // Array of coverage items like ["Screen Damage", "Battery", "Water Damage"]
  applicableProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }], // Specific products this warranty applies to
  applicableCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }], // Categories this warranty applies to
  isActive: {
    type: Boolean,
    default: true
  },
  termsAndConditions: {
    type: String,
    default: ''
  },
  image: {
    type: String // Warranty plan image/icon
  }
}, {
  timestamps: true
});

// Indexes for better query performance
warrantySchema.index({ isActive: 1 });
warrantySchema.index({ applicableProducts: 1 });
warrantySchema.index({ applicableCategories: 1 });

const Warranty = mongoose.models.Warranty || mongoose.model('Warranty', warrantySchema);

export default Warranty;

