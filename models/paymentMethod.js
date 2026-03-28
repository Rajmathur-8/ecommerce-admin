import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    enum: ['Razorpay', 'Cash on Delivery', 'UPI', 'Card', 'Wallet']
  },
  displayName: { type: String, required: true },
  description: { type: String },
  icon: { type: String }, // Icon name or URL
  isActive: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false },
  order: { type: Number, default: 0 }, // For sorting
  config: {
    // Razorpay specific config
    razorpayKeyId: { type: String },
    razorpayKeySecret: { type: String },
    // COD specific config
    codCharges: { type: Number, default: 0 },
    codMinAmount: { type: Number, default: 0 },
    codMaxAmount: { type: Number, default: 10000 },
    // General config
    minAmount: { type: Number, default: 0 },
    maxAmount: { type: Number, default: 100000 },
    processingFee: { type: Number, default: 0 },
    processingFeeType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' }
  },
  restrictions: {
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    excludeCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    minOrderValue: { type: Number, default: 0 },
    maxOrderValue: { type: Number, default: 100000 }
  }
}, { timestamps: true });

const PaymentMethod = mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', paymentMethodSchema);

export default PaymentMethod; 