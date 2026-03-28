import ProductModel from '../models/product.js';
import CategoryModel from '../models/category.js';
import { shouldSendStockAlert, sendStockAlert, getAdminContacts, sendStockAlertNotification } from './notificationService.js';
import { notificationConfig } from '../config/notification.config.js';

class StockMonitoringService {
  constructor() {
    this.monitoringInterval = null;
    this.isMonitoring = false;
    this.lastCheckTime = null;
  }

  // Start real-time stock monitoring
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('Stock monitoring is already running');
      return;
    }

    if (!notificationConfig.stockAlert.realTimeMonitoring) {
      console.log('Real-time stock monitoring is disabled');
      return;
    }

    const intervalMinutes = notificationConfig.stockAlert.checkIntervalMinutes;
    const intervalMs = intervalMinutes * 60 * 1000;

    this.monitoringInterval = setInterval(async () => {
      await this.checkStockLevels();
    }, intervalMs);

    this.isMonitoring = true;
    console.log(`✅ Real-time stock monitoring started (checking every ${intervalMinutes} minutes)`);
    console.log(`📅 Next check will be at: ${new Date(Date.now() + intervalMs).toISOString()}`);
    console.log(`⚙️ Environment Config: STOCK_ALERT_ENABLED=${process.env.STOCK_ALERT_ENABLED}, STOCK_ALERT_COOLDOWN_HOURS=${process.env.STOCK_ALERT_COOLDOWN_HOURS}, STOCK_CHECK_INTERVAL_MINUTES=${process.env.STOCK_CHECK_INTERVAL_MINUTES}`);
    console.log(`🚨 Immediate Alert: ${notificationConfig.stockAlert.immediateAlert ? 'ENABLED' : 'DISABLED'}`);
  }

  // Stop real-time stock monitoring
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Real-time stock monitoring stopped');
  }

  // Check stock levels for all products
  async checkStockLevels() {
    try {
      console.log('🔍 Checking stock levels...');
      console.log(`📊 Stock Alert Config: enabled=${notificationConfig.stockAlert.enabled}, cooldown=${notificationConfig.stockAlert.cooldownHours}h, interval=${notificationConfig.stockAlert.checkIntervalMinutes}min`);
      this.lastCheckTime = new Date();

      const products = await ProductModel.find({
        stockAlertEnabled: true,
        isActive: true
      }).populate('category', 'name');

      const lowStockProducts = products.filter(product => 
        product.stock <= product.lowStockThreshold
      );

      console.log(`Found ${lowStockProducts.length} products with low stock out of ${products.length} total products`);

      if (lowStockProducts.length === 0) {
        return { checked: products.length, alerts: 0 };
      }

      const { emails, phones } = await getAdminContacts();
      let alertCount = 0;

      for (const product of lowStockProducts) {
        if (shouldSendStockAlert(product)) {
          // Determine alert type based on stock level
          let alertType = 'low_stock';
          if (product.stock === 0) {
            alertType = 'out_of_stock';
          } else if (product.stock <= 2) {
            alertType = 'critical_stock';
          }

          // Send enhanced notifications (email, SMS, WhatsApp)
          const notificationResult = await sendStockAlertNotification(product, alertType);
          
          if (notificationResult.success) {
            // Update last alert sent timestamp
            await ProductModel.findByIdAndUpdate(product._id, {
              lastStockAlertSent: new Date()
            });
            
            alertCount++;
            console.log(`🚨 Enhanced stock alert sent for: ${product.productName} (Stock: ${product.stock}, Type: ${alertType})`);
            console.log(`📧 Notifications sent: ${notificationResult.totalSent}/${notificationResult.notifications.length}`);
          }
        }
      }

      console.log(`✅ Stock check completed: ${alertCount} alerts sent`);
      return { checked: products.length, alerts: alertCount };
    } catch (error) {
      return { checked: 0, alerts: 0, error: error.message };
    }
  }

  // Check stock levels for a specific product (called after stock updates)
  async checkProductStock(productId) {
    try {
      console.log(`🔍 Checking stock for product ID: ${productId}`);
      
      const product = await ProductModel.findById(productId)
        .populate('category', 'name');

      if (!product) {
        console.log(`❌ Product not found: ${productId}`);
        return false;
      }

      if (!product.stockAlertEnabled) {
        console.log(`⚠️ Stock alerts disabled for product: ${product.productName}`);
        return false;
      }

      console.log(`📦 Product: ${product.productName}, Stock: ${product.stock}, Threshold: ${product.lowStockThreshold}`);

      // Check if stock is below threshold (immediate check)
      if (product.stock <= product.lowStockThreshold) {
        // Determine alert type based on stock level
        let alertType = 'low_stock';
        if (product.stock === 0) {
          alertType = 'out_of_stock';
        } else if (product.stock <= 2) {
          alertType = 'critical_stock';
        }

        console.log(`🚨 Stock below threshold! Alert type: ${alertType}`);

        // Check cooldown period - with 0 cooldown, this should always pass
        if (shouldSendStockAlert(product)) {
          console.log(`✅ Alert approved - sending notifications...`);
          
          // Send enhanced notifications (email, SMS, WhatsApp)
          const notificationResult = await sendStockAlertNotification(product, alertType);
          
          if (notificationResult.success) {
            // Update last alert sent timestamp
            await ProductModel.findByIdAndUpdate(productId, {
              lastStockAlertSent: new Date()
            });
            
            console.log(`🚨 IMMEDIATE stock alert sent for: ${product.productName} (Stock: ${product.stock}, Type: ${alertType})`);
            console.log(`📧 Notifications sent: ${notificationResult.totalSent}/${notificationResult.notifications.length}`);
            return true;
          } else {
            console.log(`❌ Failed to send notifications: ${notificationResult.error}`);
          }
        } else {
          console.log(`⏰ Alert blocked by cooldown for: ${product.productName} (Stock: ${product.stock})`);
        }
      } else {
        console.log(`✅ Stock above threshold for: ${product.productName} (Stock: ${product.stock} > ${product.lowStockThreshold})`);
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  // Check stock levels for multiple products (called after order placement)
  async checkOrderStockLevels(orderItems) {
    try {
      const productIds = orderItems.map(item => item.product).filter(Boolean);
      
      if (productIds.length === 0) {
        return { checked: 0, alerts: 0 };
      }

      const products = await ProductModel.find({
        _id: { $in: productIds },
        stockAlertEnabled: true,
        isActive: true
      }).populate('category', 'name');

      const { emails, phones } = await getAdminContacts();
      let alertCount = 0;

      for (const product of products) {
        if (shouldSendStockAlert(product)) {
          const alertSent = await sendStockAlert(product, emails, phones);
          
          if (alertSent) {
            await ProductModel.findByIdAndUpdate(product._id, {
              lastStockAlertSent: new Date()
            });
            
            alertCount++;
            console.log(`🚨 Order-triggered stock alert sent for: ${product.productName} (Stock: ${product.stock})`);
          }
        }
      }

      return { checked: products.length, alerts: alertCount };
    } catch (error) {
      return { checked: 0, alerts: 0, error: error.message };
    }
  }

  // Get monitoring status
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      lastCheckTime: this.lastCheckTime,
      checkIntervalMinutes: notificationConfig.stockAlert.checkIntervalMinutes,
      realTimeMonitoring: notificationConfig.stockAlert.realTimeMonitoring,
      cooldownHours: notificationConfig.stockAlert.cooldownHours
    };
  }

  // Get low stock statistics
  async getLowStockStats() {
    try {
      const totalProducts = await ProductModel.countDocuments({ isActive: true });
      const lowStockProducts = await ProductModel.countDocuments({
        stockAlertEnabled: true,
        isActive: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] }
      });
      const outOfStockProducts = await ProductModel.countDocuments({
        isActive: true,
        stock: 0
      });
      const alertEnabledProducts = await ProductModel.countDocuments({
        stockAlertEnabled: true,
        isActive: true
      });

      return {
        totalProducts,
        lowStockProducts,
        outOfStockProducts,
        alertEnabledProducts,
        lastCheckTime: this.lastCheckTime
      };
    } catch (error) {
      return null;
    }
  }
}

// Create singleton instance
const stockMonitoringService = new StockMonitoringService();

export default stockMonitoringService;
