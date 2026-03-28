import mongoose from 'mongoose';

const enquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    trim: true,
    default: 'General Inquiry'
  },
  type: {
    type: String,
    enum: ['general', 'product', 'order', 'payment', 'delivery', 'return', 'other'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['new', 'read', 'in_progress', 'replied', 'resolved', 'closed'],
    default: 'new'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },
  // Admin response
  adminResponse: {
    type: String,
    trim: true
  },
  repliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  repliedAt: {
    type: Date
  },
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // Tags for categorization
  tags: [{
    type: String,
    trim: true
  }],
  // Internal notes (only visible to admin)
  internalNotes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for better query performance
enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ user: 1, createdAt: -1 });
enquirySchema.index({ email: 1, createdAt: -1 });

const Enquiry = mongoose.models.Enquiry || mongoose.model('Enquiry', enquirySchema);

export default Enquiry;

