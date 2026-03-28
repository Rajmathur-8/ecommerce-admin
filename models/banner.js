import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  title: { type: String },
  description: { type: String },
  image: { type: String, required: true },
  width: { type: Number, default: 1920, min: 1 },
  height: { type: Number, default: 600, min: 1 },
  isActive: { type: Boolean, default: true },
  link: { type: String, default: '' }, // Link URL for banner
  isPreOrder: { type: Boolean, default: false }, // Pre-order banner flag
  preOrderProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null }, // Product for pre-order
}, { timestamps: true });

const Banner = mongoose.models.Banner || mongoose.model('Banner', bannerSchema);

export default Banner; 