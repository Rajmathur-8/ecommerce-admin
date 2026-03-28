import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  // Email Settings
  emailSettings: {
    smtpHost: {
      type: String,
      default: 'smtp.gmail.com'
    },
    smtpPort: {
      type: Number,
      default: 587
    },
    smtpUser: {
      type: String,
      default: ''
    },
    smtpPassword: {
      type: String,
      default: ''
    },
    fromEmail: {
      type: String,
      default: 'noreply@guptadistributors.com'
    },
    fromName: {
      type: String,
      default: 'Gupta Distributors'
    },
    orderNotifications: {
      type: Boolean,
      default: true
    },
    stockAlertNotifications: {
      type: Boolean,
      default: true
    },
    customerNotifications: {
      type: Boolean,
      default: true
    }
  },

  // Stock Alert Settings
  stockAlertSettings: {
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0
    },
    criticalStockThreshold: {
      type: Number,
      default: 5,
      min: 0
    },
    enableAutoAlerts: {
      type: Boolean,
      default: true
    },
    alertEmails: {
      type: [String],
      default: []
    },
    checkInterval: {
      type: String,
      enum: ['daily', 'hourly', 'realtime'],
      default: 'daily'
    }
  },

  // Active User Settings
  activeUserSettings: {
    activeDays: {
      type: Number,
      default: 15,
      min: 1,
      max: 90,
      description: 'Number of days to consider a user as active'
    },
    weeklyActiveDays: {
      type: Number,
      default: 7,
      min: 1,
      max: 30
    },
    monthlyActiveDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 90
    }
  },

  // General Settings
  generalSettings: {
    siteName: {
      type: String,
      default: 'Ecommerce Store'
    },
    siteUrl: {
      type: String,
      default: 'http://localhost:3000'
    },
    currency: {
      type: String,
      default: 'INR'
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    },
    language: {
      type: String,
      default: 'en'
    }
  },

  // Order Settings
  orderSettings: {
    autoConfirmOrders: {
      type: Boolean,
      default: false
    },
    orderPrefix: {
      type: String,
      default: 'ORD'
    },
    minOrderAmount: {
      type: Number,
      default: 0
    },
    maxOrderAmount: {
      type: Number,
      default: 100000
    }
  },

  // Notification Settings
  notificationSettings: {
    enablePushNotifications: {
      type: Boolean,
      default: false
    },
    enableSmsNotifications: {
      type: Boolean,
      default: false
    },
    smsProvider: {
      type: String,
      enum: ['twilio', 'msg91', 'none'],
      default: 'none'
    }
  },

  // COD (Cash on Delivery) Settings
  codSettings: {
    enabledPincodes: {
      type: [String],
      default: [],
      description: 'List of pincodes where COD is available'
    },
    enableForAll: {
      type: Boolean,
      default: false,
      description: 'If true, COD available for all pincodes'
    }
  },

  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Update settings (only one document allowed)
settingsSchema.statics.updateSettings = async function(updates, adminId) {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  
  Object.keys(updates).forEach(key => {
    if (settings[key] && typeof updates[key] === 'object') {
      settings[key] = { ...settings[key], ...updates[key] };
    } else {
      settings[key] = updates[key];
    }
  });
  
  settings.lastUpdatedBy = adminId;
  settings.updatedAt = new Date();
  await settings.save();
  
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;

