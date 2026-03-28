// Notification Service Configuration
export const notificationConfig = {
  // Email Service Configuration
  email: {
    enabled: process.env.STOCK_ALERT_EMAIL_ENABLED === 'true' || true, // Default to true
    provider: process.env.EMAIL_PROVIDER || 'nodemailer', // 'sendgrid', 'aws_ses', 'nodemailer'
    
    // Nodemailer Configuration (for Gmail, Outlook, etc.)
    nodemailer: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      fromEmail: process.env.SMTP_FROM_EMAIL || 'noreply@yourdomain.com'
    }
  },
  
  // WhatsApp Business API Configuration
  whatsapp: {
    enabled: process.env.STOCK_ALERT_WHATSAPP_ENABLED === 'true' || true, // Default to true
    provider: process.env.WHATSAPP_PROVIDER || 'twilio', // 'twilio', 'meta', 'custom'
    
    // Twilio WhatsApp Configuration
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_WHATSAPP_NUMBER,
      fromWhatsApp: process.env.TWILIO_WHATSAPP_FROM || `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`
    },
    
    // Meta WhatsApp Business API
    meta: {
      accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
      businessAccountId: process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID,
      fromNumber: process.env.META_WHATSAPP_FROM_NUMBER
    }
  },
  
  // SMS Service Configuration
  sms: {
    enabled: process.env.STOCK_ALERT_SMS_ENABLED === 'true' || true, // Default to true
    provider: process.env.SMS_PROVIDER || 'twilio', // 'twilio', 'aws_sns', 'custom'
    
    // Twilio SMS Configuration
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_PHONE_NUMBER
    },
  },
  
  // Stock Alert Configuration
  stockAlert: {
    enabled: process.env.STOCK_ALERT_ENABLED === 'true' || true, // Default to true if not set
    cooldownHours: parseInt(process.env.STOCK_ALERT_COOLDOWN_HOURS) || 0, // No cooldown for immediate alerts
    defaultThreshold: parseInt(process.env.DEFAULT_LOW_STOCK_THRESHOLD) || 10,
    realTimeMonitoring: process.env.REAL_TIME_STOCK_MONITORING === 'true' || true, // Default to true
    checkIntervalMinutes: parseInt(process.env.STOCK_CHECK_INTERVAL_MINUTES) || 1, // 1 minute for immediate alerts
    immediateAlert: true, // Immediate alert when stock changes
    
    // Daily Cron Job Configuration
    dailyCron: {
      enabled: process.env.DAILY_STOCK_REPORT_ENABLED === 'true',
      schedule: process.env.DAILY_STOCK_REPORT_SCHEDULE || '0 9 * * *', // Daily at 9:00 AM
      hour: parseInt(process.env.DAILY_STOCK_REPORT_HOUR) || 9, // 9 AM
      timezone: process.env.DAILY_STOCK_REPORT_TIMEZONE || 'Asia/Kolkata'
    }
  },
  
  // Notification Priority (order of sending)
  priority: process.env.NOTIFICATION_PRIORITY?.split(',') || ['email', 'whatsapp', 'sms'],
  
  // Admin Panel URL for links in notifications
  adminPanelUrl: process.env.ADMIN_PANEL_URL || 'http://localhost:3001'
};

// Validate configuration
export const validateNotificationConfig = () => {
  const errors = [];
  
  if (notificationConfig.email.enabled) {
    if (notificationConfig.email.provider === 'sendgrid' && !notificationConfig.email.sendgrid.apiKey) {
      errors.push('SendGrid API key is required for email notifications');
    }
    if (notificationConfig.email.provider === 'aws_ses' && (!notificationConfig.email.awsSes.accessKeyId || !notificationConfig.email.awsSes.secretAccessKey)) {
      errors.push('AWS SES credentials are required for email notifications');
    }
  }
  
  if (notificationConfig.whatsapp.enabled) {
    if (notificationConfig.whatsapp.provider === 'twilio' && (!notificationConfig.whatsapp.twilio.accountSid || !notificationConfig.whatsapp.twilio.authToken)) {
      errors.push('Twilio credentials are required for WhatsApp notifications');
    }
    if (notificationConfig.whatsapp.provider === 'meta' && !notificationConfig.whatsapp.meta.accessToken) {
      errors.push('Meta WhatsApp access token is required for WhatsApp notifications');
    }
  }
  
  if (notificationConfig.sms.enabled) {
    if (notificationConfig.sms.provider === 'twilio' && (!notificationConfig.sms.twilio.accountSid || !notificationConfig.sms.twilio.authToken)) {
      errors.push('Twilio credentials are required for SMS notifications');
    }
    if (notificationConfig.sms.provider === 'aws_sns' && (!notificationConfig.sms.awsSns.accessKeyId || !notificationConfig.sms.awsSns.secretAccessKey)) {
      errors.push('AWS SNS credentials are required for SMS notifications');
    }
  }
  
  return errors;
};
