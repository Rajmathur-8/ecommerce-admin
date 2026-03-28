import mongoose from 'mongoose';

const notificationLogSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false // Make optional for stock alerts
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Make optional for stock alerts
  },
  type: {
    type: String,
    enum: ['email', 'sms', 'whatsapp', 'stock_alert'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  recipient: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  orderStatus: {
    type: String,
    required: true
  },
  trackingNumber: {
    type: String,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  sentAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for better query performance
notificationLogSchema.index({ order: 1, createdAt: -1 });
notificationLogSchema.index({ user: 1, createdAt: -1 });
notificationLogSchema.index({ type: 1, status: 1 });

const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

export default NotificationLog; 