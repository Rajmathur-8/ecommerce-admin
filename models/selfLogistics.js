import mongoose from 'mongoose';

const selfLogisticsSchema = new mongoose.Schema({
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
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
selfLogisticsSchema.index({ email: 1 });
selfLogisticsSchema.index({ isActive: 1 });
selfLogisticsSchema.index({ createdAt: -1 });

const SelfLogistics = mongoose.models.SelfLogistics || mongoose.model('SelfLogistics', selfLogisticsSchema);

export default SelfLogistics;

