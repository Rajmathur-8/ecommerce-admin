import mongoose from 'mongoose';

const deliveryTrackingSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  shippingPartner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShippingPartner',
    required: true
  },
  trackingNumber: {
    type: String,
    required: true,
    unique: true
  },
  awbNumber: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: [
      'order_placed',
      'pending',
      'pickup_scheduled',
      'picked_up',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'failed',
      'returned',
      'cancelled'
    ],
    default: 'order_placed'
  },
  currentLocation: {
    city: String,
    state: String,
    pincode: String,
    facility: String
  },
  estimatedDelivery: {
    type: Date,
    default: null
  },
  actualDelivery: {
    type: Date,
    default: null
  },
  pickupDate: {
    type: Date,
    default: null
  },
  deliveryAttempts: {
    type: Number,
    default: 0
  },
  maxDeliveryAttempts: {
    type: Number,
    default: 3
  },
  packageDetails: {
    weight: {
      type: Number,
      default: 0
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['cm', 'inch'],
        default: 'cm'
      }
    },
    declaredValue: {
      type: Number,
      default: 0
    }
  },
  recipientDetails: {
    name: String,
    mobile: String,
    address: String,
    pincode: String
  },
  deliveryInstructions: {
    type: String,
    default: null
  },
  signature: {
    type: String,
    default: null
  },
  deliveryProof: {
    photo: String,
    timestamp: Date
  },
  deliveryBoy: {
    name: String,
    phone: String,
    id: String,
    assignedAt: Date
  },
  timeline: [{
    status: {
      type: String,
      required: true
    },
    location: {
      city: String,
      state: String,
      facility: String
    },
    description: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: String,
      enum: ['system', 'partner', 'admin'],
      default: 'system'
    }
  }],
  notes: [{
    note: String,
    addedBy: {
      type: String,
      enum: ['admin', 'partner', 'customer'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
// Note: trackingNumber has unique: true which already creates an index
deliveryTrackingSchema.index({ order: 1 });
deliveryTrackingSchema.index({ status: 1 });
deliveryTrackingSchema.index({ estimatedDelivery: 1 });
deliveryTrackingSchema.index({ shippingPartner: 1 });

// Virtual for current status display
deliveryTrackingSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    order_placed: 'Order Placed',
    pending: 'Pending',
    pickup_scheduled: 'Pickup Scheduled',
    picked_up: 'Picked Up',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    failed: 'Delivery Failed',
    returned: 'Returned',
    cancelled: 'Cancelled'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for delivery progress percentage
deliveryTrackingSchema.virtual('progressPercentage').get(function() {
  const statusOrder = [
    'order_placed',
    'pending',
    'pickup_scheduled',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered'
  ];
  const currentIndex = statusOrder.indexOf(this.status);
  if (currentIndex === -1) return 0;
  return Math.round((currentIndex / (statusOrder.length - 1)) * 100);
});

// Method to add timeline entry
deliveryTrackingSchema.methods.addTimelineEntry = function(status, location, description, updatedBy = 'system') {
  this.timeline.push({
    status,
    location,
    description,
    updatedBy,
    timestamp: new Date()
  });
  this.status = status;
  return this.save();
};

// Method to add note
deliveryTrackingSchema.methods.addNote = function(note, addedBy) {
  this.notes.push({
    note,
    addedBy,
    timestamp: new Date()
  });
  return this.save();
};

// Static method to get tracking by number
deliveryTrackingSchema.statics.findByTrackingNumber = function(trackingNumber) {
  return this.findOne({ trackingNumber, isActive: true })
    .populate('order', 'orderStatus total items')
    .populate('shippingPartner', 'name displayName trackingUrl');
};

// Static method to get active deliveries
deliveryTrackingSchema.statics.getActiveDeliveries = function() {
  return this.find({
    isActive: true,
    status: { $nin: ['delivered', 'cancelled', 'returned'] }
  })
    .populate('order', 'orderStatus total')
    .populate('shippingPartner', 'name displayName')
    .sort({ estimatedDelivery: 1 });
};

const DeliveryTracking = mongoose.model('DeliveryTracking', deliveryTrackingSchema);

export default DeliveryTracking; 