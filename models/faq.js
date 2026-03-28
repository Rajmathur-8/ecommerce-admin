import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['general', 'product', 'order', 'payment', 'delivery', 'return', 'warranty', 'authenticity', 'installation', 'damage', 'specifications', 'support', 'accessories', 'account', 'other'],
    default: 'general'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  // Helpful count (for future analytics)
  helpfulCount: {
    type: Number,
    default: 0
  },
  // Tags for better categorization
  tags: [{
    type: String,
    trim: true
  }],
  // Created/Updated by admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  }
}, {
  timestamps: true
});

// Index for better query performance
faqSchema.index({ category: 1, isActive: 1, order: 1 });
faqSchema.index({ question: 'text', answer: 'text' }); // Text search index

const FAQ = mongoose.models.FAQ || mongoose.model('FAQ', faqSchema);

export default FAQ;

