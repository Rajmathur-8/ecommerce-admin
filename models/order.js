import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false // Made optional to support manual/frequently bought products
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    discountPrice: {
      type: Number,
      default: null
    },
    variant: {
      type: String,
      default: null
    },
    warranty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warranty',
      default: null
    },
    // For frequently bought together items (manual products)
    manualProduct: {
      productName: { type: String },
      images: [{ type: String }],
      price: { type: Number },
      discountPrice: { type: Number },
      sku: { type: String },
      isManual: { type: Boolean, default: true }
    },
    // Flag to identify frequently bought together items
    isFrequentlyBoughtTogether: {
      type: Boolean,
      default: false
    }
  }],
  address: {
    name: {
      type: String,
      required: true
    },
    mobile: {
      type: String,
      required: true
    },
    addressLine1: {
      type: String,
      required: true
    },
    addressLine2: {
      type: String,
      default: ''
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    pincode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'India'
    }
  },
  paymentMethod: {
    type: String,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'placed', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  subtotal: {
    type: Number,
    required: true
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  couponCode: {
    type: String,
    default: null
  },
  couponDiscount: {
    type: Number,
    default: 0
  },
  promoCode: {
    type: String,
    default: null
  },
  promoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Promo',
    default: null
  },
  promoDiscount: {
    type: Number,
    default: 0
  },
  giftVoucherCode: {
    type: String,
    default: null
  },
  giftVoucherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GiftVoucher',
    default: null
  },
  giftVoucherDiscount: {
    type: Number,
    default: 0
  },
  rewardPointsDiscount: {
    type: Number,
    default: 0
  },
  shippingCharges: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  trackingNumber: {
    type: String,
    default: null
  },
  estimatedDelivery: {
    type: Date,
    default: null
  },
  returnReason: {
    type: String,
    default: null
  },
  returnDescription: {
    type: String,
    default: null
  },
  returnDate: {
    type: Date,
    default: null
  },
  // iThink Logistics Integration Fields
  ithinkAwbNumber: {
    type: String,
    default: null
  },
  ithinkTrackingNumber: {
    type: String,
    default: null
  },
  logisticsSynced: {
    type: Boolean,
    default: false
  },
  logisticsSyncedAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  // Shipment details (auto-filled from product if single product, manual for multiple)
  shipmentDetails: {
    length: { type: Number, min: 0 }, // in cm
    width: { type: Number, min: 0 }, // in cm
    height: { type: Number, min: 0 }, // in cm
    weight: { type: Number, min: 0 } // in kg
  },
  // Self Logistics fields
  logisticsType: {
    type: String,
    enum: ['ithink', 'self'],
    default: 'ithink'
  },
  selfLogisticsId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SelfLogistics',
    default: null
  },
  selfLogisticsDetails: {
    name: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String }
  },
  // Pre-order fields
  isPreOrder: { type: Boolean, default: false },
  preOrderBannerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Banner', default: null },
  // Frequently bought together items
  frequentlyBoughtTogether: [{
    cartItemId: { type: String, required: true }, // The cart item ID this was selected for
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false // Made optional to support manual products
    },
    quantity: {
      type: Number,
      default: 1
    },
    price: {
      type: Number,
      required: true
    },
    // For manual products that don't exist in Product collection
    manualProduct: {
      productName: { type: String },
      images: [{ type: String }],
      price: { type: Number },
      discountPrice: { type: Number },
      sku: { type: String },
      isManual: { type: Boolean, default: true }
    }
  }]
}, {
  timestamps: true
});

// Index for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });

const Order = mongoose.model('Order', orderSchema);

export default Order; 