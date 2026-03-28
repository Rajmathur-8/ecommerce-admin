import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true
  },
  order: {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    user: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      email: String,
      name: String,
      phone: String
    },
    address: {
      name: String,
      mobile: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      pincode: String
    },
    total: Number,
    paymentMethod: String,
    paymentStatus: String,
    orderStatus: String,
    createdAt: Date
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['success', 'pending', 'failed', 'refunded'],
    required: true
  },
  method: {
    type: String,
    required: true
  },
  gatewayFee: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    required: true
  },
  transactionDate: {
    type: Date,
    default: Date.now
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
// Note: orderId has unique: true which already creates an index
transactionSchema.index({ status: 1 });
transactionSchema.index({ method: 1 });
transactionSchema.index({ createdAt: -1 });

const TransactionModel = mongoose.model('Transaction', transactionSchema);

export default TransactionModel;
