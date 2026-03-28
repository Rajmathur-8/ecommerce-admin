import cron from 'node-cron';
import ProductModel from '../models/product.js';
import { sendStockAlertNotification, getAdminContacts } from './notificationService.js';
import { notificationConfig } from '../config/notification.config.js';

class CronJobService {
  constructor() {
    this.dailyStockAlertJob = null;
    this.isRunning = false;
  }

  // Start daily stock alert cron job
  startDailyStockAlert() {
    if (this.isRunning) {
      console.log('Daily stock alert cron job is already running');
      return;
    }

    if (!notificationConfig.stockAlert.dailyCron.enabled) {
      console.log('Daily stock alert cron job is disabled');
      return;
    }

    const cronExpression = notificationConfig.stockAlert.dailyCron.schedule;
    
    this.dailyStockAlertJob = cron.schedule(cronExpression, async () => {
      console.log('🕐 Daily stock alert cron job triggered at:', new Date().toISOString());
      await this.sendDailyStockReport();
    }, {
      scheduled: false,
      timezone: notificationConfig.stockAlert.dailyCron.timezone
    });

    this.dailyStockAlertJob.start();
    this.isRunning = true;
    
    console.log(`✅ Daily stock alert cron job started`);
    console.log(`📅 Schedule: ${cronExpression}`);
    console.log(`🌍 Timezone: ${notificationConfig.stockAlert.dailyCron.timezone}`);
    console.log(`⏰ Next run: ${this.getNextRunTime()}`);
  }

  // Stop daily stock alert cron job
  stopDailyStockAlert() {
    if (this.dailyStockAlertJob) {
      this.dailyStockAlertJob.stop();
      this.dailyStockAlertJob = null;
    }
    this.isRunning = false;
    console.log('🛑 Daily stock alert cron job stopped');
  }

  // Send daily stock report
  async sendDailyStockReport() {
    try {
      console.log('📊 Generating daily stock report...');
      
      // Get all products with low stock
      const lowStockProducts = await ProductModel.find({
        stockAlertEnabled: true,
        isActive: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] }
      }).populate('category', 'name');

      // Get out of stock products
      const outOfStockProducts = await ProductModel.find({
        stockAlertEnabled: true,
        isActive: true,
        stock: 0
      }).populate('category', 'name');

      // Get critical stock products (stock <= 2)
      const criticalStockProducts = await ProductModel.find({
        stockAlertEnabled: true,
        isActive: true,
        stock: { $gt: 0, $lte: 2 }
      }).populate('category', 'name');

      // Get admin contacts
      const { emails, phones } = await getAdminContacts();

      if (emails.length === 0 && phones.length === 0) {
        console.log('❌ No admin contacts found for daily stock report');
        return;
      }

      // Prepare daily report data
      const reportData = {
        date: new Date().toLocaleDateString('en-IN'),
        totalLowStock: lowStockProducts.length,
        totalOutOfStock: outOfStockProducts.length,
        totalCriticalStock: criticalStockProducts.length,
        lowStockProducts: lowStockProducts.map(p => ({
          name: p.productName,
          stock: p.stock,
          threshold: p.lowStockThreshold,
          category: p.category?.name,
          sku: p.sku
        })),
        outOfStockProducts: outOfStockProducts.map(p => ({
          name: p.productName,
          category: p.category?.name,
          sku: p.sku
        })),
        criticalStockProducts: criticalStockProducts.map(p => ({
          name: p.productName,
          stock: p.stock,
          category: p.category?.name,
          sku: p.sku
        }))
      };

      // Send daily report notifications
      const notificationResult = await this.sendDailyReportNotifications(reportData, emails, phones);
      
      if (notificationResult.success) {
        console.log(`✅ Daily stock report sent successfully`);
        console.log(`📧 Notifications sent: ${notificationResult.totalSent}/${notificationResult.notifications.length}`);
      } else {
        console.log(`❌ Failed to send daily stock report`);
      }

    } catch (error) {
    }
  }

  // Send daily report notifications
  async sendDailyReportNotifications(reportData, emails, phones) {
    const notifications = [];
    let totalSent = 0;

    try {
      // Email notification
      if (notificationConfig.email.enabled && emails.length > 0) {
        const emailResult = await this.sendDailyReportEmail(reportData, emails);
        notifications.push({
          type: 'email',
          success: emailResult.success,
          recipients: emails.length,
          message: emailResult.message
        });
        if (emailResult.success) totalSent++;
      }

      // WhatsApp notification
      if (notificationConfig.whatsapp.enabled && phones.length > 0) {
        const whatsappResult = await this.sendDailyReportWhatsApp(reportData, phones);
        notifications.push({
          type: 'whatsapp',
          success: whatsappResult.success,
          recipients: phones.length,
          message: whatsappResult.message
        });
        if (whatsappResult.success) totalSent++;
      }

      // SMS notification
      if (notificationConfig.sms.enabled && phones.length > 0) {
        const smsResult = await this.sendDailyReportSMS(reportData, phones);
        notifications.push({
          type: 'sms',
          success: smsResult.success,
          recipients: phones.length,
          message: smsResult.message
        });
        if (smsResult.success) totalSent++;
      }

      return {
        success: totalSent > 0,
        totalSent,
        notifications
      };

    } catch (error) {
      return {
        success: false,
        totalSent: 0,
        notifications: [],
        error: error.message
      };
    }
  }

  // Send daily report email
  async sendDailyReportEmail(reportData, emails) {
    try {
      const nodemailer = await import('nodemailer');
      
      const transporter = nodemailer.createTransporter({
        host: notificationConfig.email.nodemailer.host,
        port: notificationConfig.email.nodemailer.port,
        secure: notificationConfig.email.nodemailer.secure,
        auth: notificationConfig.email.nodemailer.auth
      });

      const htmlContent = this.generateDailyReportHTML(reportData);
      
      const mailOptions = {
        from: notificationConfig.email.nodemailer.fromEmail,
        to: "kravish456@gmail.com", //emails.join(', '),
        subject: `📊 Daily Stock Report - ${reportData.date}`,
        html: htmlContent
      };

      await transporter.sendMail(mailOptions);
      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Send daily report WhatsApp
  async sendDailyReportWhatsApp(reportData, phones) {
    try {
      const twilio = await import('twilio');
      const client = twilio.default(
        notificationConfig.whatsapp.twilio.accountSid,
        notificationConfig.whatsapp.twilio.authToken
      );

      const message = this.generateDailyReportText(reportData);
      
      for (const phone of phones) {
        await client.messages.create({
          from: notificationConfig.whatsapp.twilio.fromWhatsApp,
          to: '+919122389911',//`whatsapp:${phone}`,
          body: message
        });
      }

      return { success: true, message: 'WhatsApp messages sent successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Send daily report SMS
  async sendDailyReportSMS(reportData, phones) {
    try {
      const twilio = await import('twilio');
      const client = twilio.default(
        notificationConfig.sms.twilio.accountSid,
        notificationConfig.sms.twilio.authToken
      );

      const message = this.generateDailyReportText(reportData);
      
      for (const phone of phones) {
        await client.messages.create({
          from: notificationConfig.sms.twilio.fromNumber,
          to: '+919122389911',//phone,
          body: message
        });
      }

      return { success: true, message: 'SMS messages sent successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Generate daily report HTML
  generateDailyReportHTML(reportData) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { background-color: #f4f4f4; padding: 20px; border-radius: 5px; }
          .section { margin: 20px 0; }
          .product-list { background-color: #f9f9f9; padding: 15px; border-radius: 5px; }
          .product-item { margin: 10px 0; padding: 10px; border-left: 4px solid #007bff; }
          .critical { border-left-color: #dc3545; }
          .out-of-stock { border-left-color: #6c757d; }
          .stats { display: flex; gap: 20px; }
          .stat-box { background-color: #e9ecef; padding: 15px; border-radius: 5px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 Daily Stock Report</h1>
          <p><strong>Date:</strong> ${reportData.date}</p>
        </div>

        <div class="stats">
          <div class="stat-box">
            <h3>${reportData.totalLowStock}</h3>
            <p>Low Stock Products</p>
          </div>
          <div class="stat-box">
            <h3>${reportData.totalOutOfStock}</h3>
            <p>Out of Stock</p>
          </div>
          <div class="stat-box">
            <h3>${reportData.totalCriticalStock}</h3>
            <p>Critical Stock</p>
          </div>
        </div>

        ${reportData.outOfStockProducts.length > 0 ? `
        <div class="section">
          <h2>🚨 Out of Stock Products</h2>
          <div class="product-list">
            ${reportData.outOfStockProducts.map(p => `
              <div class="product-item out-of-stock">
                <strong>${p.name}</strong> (${p.sku})<br>
                <small>Category: ${p.category || 'N/A'}</small>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        ${reportData.criticalStockProducts.length > 0 ? `
        <div class="section">
          <h2>⚠️ Critical Stock Products (≤2 items)</h2>
          <div class="product-list">
            ${reportData.criticalStockProducts.map(p => `
              <div class="product-item critical">
                <strong>${p.name}</strong> (${p.sku})<br>
                <small>Stock: ${p.stock} | Category: ${p.category || 'N/A'}</small>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        ${reportData.lowStockProducts.length > 0 ? `
        <div class="section">
          <h2>📉 Low Stock Products</h2>
          <div class="product-list">
            ${reportData.lowStockProducts.map(p => `
              <div class="product-item">
                <strong>${p.name}</strong> (${p.sku})<br>
                <small>Stock: ${p.stock}/${p.threshold} | Category: ${p.category || 'N/A'}</small>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <div class="section">
          <p><em>This is an automated daily stock report. Please check your inventory and restock as needed.</em></p>
        </div>
      </body>
      </html>
    `;
  }

  // Generate daily report text (for WhatsApp/SMS)
  generateDailyReportText(reportData) {
    let message = `📊 Daily Stock Report - ${reportData.date}\n\n`;
    
    message += `📈 Summary:\n`;
    message += `• Low Stock: ${reportData.totalLowStock}\n`;
    message += `• Out of Stock: ${reportData.totalOutOfStock}\n`;
    message += `• Critical Stock: ${reportData.totalCriticalStock}\n\n`;

    if (reportData.outOfStockProducts.length > 0) {
      message += `🚨 Out of Stock:\n`;
      reportData.outOfStockProducts.slice(0, 5).forEach(p => {
        message += `• ${p.name} (${p.sku})\n`;
      });
      if (reportData.outOfStockProducts.length > 5) {
        message += `• ... and ${reportData.outOfStockProducts.length - 5} more\n`;
      }
      message += `\n`;
    }

    if (reportData.criticalStockProducts.length > 0) {
      message += `⚠️ Critical Stock (≤2):\n`;
      reportData.criticalStockProducts.slice(0, 5).forEach(p => {
        message += `• ${p.name} - ${p.stock} left\n`;
      });
      if (reportData.criticalStockProducts.length > 5) {
        message += `• ... and ${reportData.criticalStockProducts.length - 5} more\n`;
      }
      message += `\n`;
    }

    message += `Please check your inventory and restock as needed.`;
    return message;
  }

  // Get next run time
  getNextRunTime() {
    if (!this.dailyStockAlertJob) return 'Not scheduled';
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(notificationConfig.stockAlert.dailyCron.hour, 0, 0, 0);
    
    return tomorrow.toISOString();
  }

  // Get cron job status
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: notificationConfig.stockAlert.dailyCron.schedule,
      timezone: notificationConfig.stockAlert.dailyCron.timezone,
      nextRun: this.getNextRunTime(),
      enabled: notificationConfig.stockAlert.dailyCron.enabled
    };
  }
}

// Create singleton instance
const cronJobService = new CronJobService();

export default cronJobService;
