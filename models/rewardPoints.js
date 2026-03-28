import mongoose from 'mongoose';

// Individual reward points entry
const rewardPointsEntrySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  points: {
    type: Number,
    required: true,
    min: 0
  },
  orderAmount: {
    type: Number,
    required: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const rewardPointsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  entries: [rewardPointsEntrySchema],
  totalEarned: {
    type: Number,
    default: 0
  },
  totalRedeemed: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for current active points
rewardPointsSchema.virtual('currentPoints').get(function() {
  const now = new Date();
  return this.entries
    .filter(entry => entry.isActive && entry.expiryDate > now)
    .reduce((total, entry) => total + entry.points, 0);
});

// Index for better query performance
rewardPointsSchema.index({ user: 1 });
rewardPointsSchema.index({ 'entries.expiryDate': 1 });
rewardPointsSchema.index({ isActive: 1 });

const RewardPoints = mongoose.model('RewardPoints', rewardPointsSchema);

export default RewardPoints;
