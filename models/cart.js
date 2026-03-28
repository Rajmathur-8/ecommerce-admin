import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  variant: {
    type: Object,
  },
  price: {
    type: Number,
    required: true,
  },
  warranty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warranty',
    default: null
  },
}, { _id: false });

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.guestId; // user is required only if guestId is not present
    },
  },
  guestId: {
    type: String,
    required: function() {
      return !this.user; // guestId is required only if user is not present
    },
    // sparse: true is handled by the schema-level index
  },
  items: [cartItemSchema],
  savedForLater: [cartItemSchema],
  itemCount: {
    type: Number,
    default: 0,
  },
  subtotal: {
    type: Number,
    default: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    default: 0,
  },
  coupon: {
    code: {
      type: String,
    },
    discount: {
      type: Number,
    },
    couponType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: null
    }
  },
  promoCode: {
    code: {
      type: String,
    },
    promoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promo',
      default: null
    },
    discount: {
      type: Number,
    },
    promoType: {
      type: String,
      enum: ['percentage', 'fixed', 'free_shipping', 'buy_one_get_one'],
      default: null
    }
  },
  giftVoucher: {
    code: {
      type: String,
    },
    giftVoucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GiftVoucher',
      default: null
    },
    discount: {
      type: Number,
    },
    voucherType: {
      type: String,
      enum: ['percentage', 'fixed', 'free_shipping'],
      default: null
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Add compound index to ensure uniqueness
cartSchema.index({ user: 1 }, { unique: true, sparse: true });
cartSchema.index({ guestId: 1 }, { unique: true, sparse: true });

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

export default Cart;
