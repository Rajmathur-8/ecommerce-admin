import mongoose from 'mongoose';

const preOrderNotificationSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Guest user details (if not logged in)
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
  address: {
    type: String,
    trim: true,
    default: ''
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  // Notification status
  notified: {
    type: Boolean,
    default: false
  },
  notifiedAt: {
    type: Date
  },
  // Notification channels
  notificationChannels: {
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    whatsapp: {
      type: Boolean,
      default: false
    }
  },
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'notified', 'purchased', 'expired'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Index for better query performance
preOrderNotificationSchema.index({ product: 1, status: 1 });
preOrderNotificationSchema.index({ email: 1, product: 1 });
preOrderNotificationSchema.index({ user: 1, product: 1 });

const PreOrderNotification = mongoose.models.PreOrderNotification || mongoose.model('PreOrderNotification', preOrderNotificationSchema);

export default PreOrderNotification;

