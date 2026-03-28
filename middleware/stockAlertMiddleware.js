import { shouldSendStockAlert, sendStockAlertNotification } from '../services/notificationService.js';

// Middleware to check stock levels after product updates
export const checkStockAfterUpdate = async (req, res, next) => {
  try {
    // Store the original response methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override response methods to intercept the response
    res.json = function(data) {
      // Check if this was a successful product update
      if (data && data.success && (req.method === 'PUT' || req.method === 'POST')) {
        // If it's a product update, check stock levels
        if (req.params.productId || (req.body && (req.body.stock !== undefined || req.body.lowStockThreshold !== undefined))) {
          setTimeout(async () => {
            try {
              await checkStockLevelsForProduct(req.params.productId || data.data?._id);
            } catch (error) {
            }
          }, 1000); // Delay to ensure the update is complete
        }
      }
      
      // Call the original method
      return originalJson.call(this, data);
    };

    res.send = function(data) {
      // Handle string responses
      if (typeof data === 'string') {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData && parsedData.success && (req.method === 'PUT' || req.method === 'POST')) {
            if (req.params.productId || (req.body && (req.body.stock !== undefined || req.body.lowStockThreshold !== undefined))) {
              setTimeout(async () => {
                try {
                  await checkStockLevelsForProduct(req.params.productId || parsedData.data?._id);
                } catch (error) {
                }
              }, 1000);
            }
          }
        } catch (e) {
          // Not JSON data, continue normally
        }
      }
      
      return originalSend.call(this, data);
    };

    next();
  } catch (error) {
    next();
  }
};

// Function to check stock levels for a specific product
const checkStockLevelsForProduct = async (productId) => {
  try {
    const ProductModel = (await import('../models/product.js')).default;
    
    const product = await ProductModel.findById(productId)
      .populate('category', 'name');

    if (!product || !product.stockAlertEnabled) {
      return;
    }

    // Check if stock alert should be sent
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
        await ProductModel.findByIdAndUpdate(productId, {
          lastStockAlertSent: new Date()
        });
        
        console.log(`🚨 Enhanced stock alert sent for product: ${product.productName} (Stock: ${product.stock}, Type: ${alertType})`);
        console.log(`📧 Notifications sent: ${notificationResult.totalSent}/${notificationResult.notifications.length}`);
      } else {
        console.log(`❌ Failed to send stock alert notifications: ${notificationResult.error}`);
      }
    }
  } catch (error) {
  }
};

// Middleware to check stock levels after order placement
export const checkStockAfterOrder = async (req, res, next) => {
  try {
    const originalJson = res.json;
    const originalSend = res.send;

    res.json = function(data) {
      // Check if this was a successful order creation
      if (data && data.success && req.method === 'POST' && req.path.includes('/orders')) {
        setTimeout(async () => {
          try {
            await checkStockLevelsForOrderItems(data.data?.items || []);
          } catch (error) {
          }
        }, 2000); // Delay to ensure order is processed
      }
      
      return originalJson.call(this, data);
    };

    res.send = function(data) {
      if (typeof data === 'string') {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData && parsedData.success && req.method === 'POST' && req.path.includes('/orders')) {
            setTimeout(async () => {
              try {
                await checkStockLevelsForOrderItems(parsedData.data?.items || []);
              } catch (error) {
              }
            }, 2000);
          }
        } catch (e) {
          // Not JSON data, continue normally
        }
      }
      
      return originalSend.call(this, data);
    };

    next();
  } catch (error) {
    next();
  }
};

// Function to check stock levels for order items
const checkStockLevelsForOrderItems = async (items) => {
  try {
    const ProductModel = (await import('../models/product.js')).default;
    
    for (const item of items) {
      if (item.product) {
        const product = await ProductModel.findById(item.product)
          .populate('category', 'name');

        if (product && product.stockAlertEnabled && shouldSendStockAlert(product)) {
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
            await ProductModel.findByIdAndUpdate(product._id, {
              lastStockAlertSent: new Date()
            });
            
            console.log(`🚨 Enhanced stock alert sent after order for product: ${product.productName} (Stock: ${product.stock}, Type: ${alertType})`);
            console.log(`📧 Notifications sent: ${notificationResult.totalSent}/${notificationResult.notifications.length}`);
          } else {
            console.log(`❌ Failed to send stock alert notifications after order: ${notificationResult.error}`);
          }
        }
      }
    }
  } catch (error) {
  }
};
