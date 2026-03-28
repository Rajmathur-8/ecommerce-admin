import ProductModel from '../../models/product.js';
import { sendStockAlert, shouldSendStockAlert, getAdminContacts } from '../../services/notificationService.js';
import stockMonitoringService from '../../services/stockMonitoringService.js';
import cronJobService from '../../services/cronJobService.js';

// Check stock levels and send alerts
export const checkStockLevels = async (req, res) => {
  try {
    const result = await stockMonitoringService.checkStockLevels();
    
    res.status(200).json({
      success: true,
      message: 'Stock level check completed',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get low stock products
export const getLowStockProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, threshold = 10 } = req.query;
    
    console.log('🔍 Simple Stock Alert Query - Threshold:', threshold);
    
    // Simple query: products with stock <= threshold
    const query = { 
      stock: { $lte: parseInt(threshold) },
      isActive: true 
    };
    
    console.log('📋 Simple Query:', JSON.stringify(query, null, 2));
    
    const products = await ProductModel.find(query)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .sort({ stock: 1, productName: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ProductModel.countDocuments(query);
    
    console.log(`📊 Simple Results: Found ${products.length} products with stock <= ${threshold}`);

    const lowStockProducts = products.map(product => ({
      _id: product._id,
      productName: product.productName,
      sku: product.sku,
      currentStock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      category: product.category?.name,
      subcategory: product.subcategory?.name,
      price: product.price,
      lastStockAlertSent: product.lastStockAlertSent,
      stockStatus: product.stock === 0 ? 'Out of Stock' : 
                   product.stock <= product.lowStockThreshold ? 'Low Stock' : 'In Stock'
    }));

    res.status(200).json({
      success: true,
      data: {
        products: lowStockProducts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalProducts: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update stock alert settings for a product
export const updateStockAlertSettings = async (req, res) => {
  try {
    const { productId } = req.params;
    const { lowStockThreshold, stockAlertEnabled } = req.body;

    const updateData = {};
    if (lowStockThreshold !== undefined) {
      updateData.lowStockThreshold = parseInt(lowStockThreshold);
    }
    if (stockAlertEnabled !== undefined) {
      updateData.stockAlertEnabled = stockAlertEnabled;
    }

    const product = await ProductModel.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    ).populate('category', 'name');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Stock alert settings updated successfully',
      data: {
        _id: product._id,
        productName: product.productName,
        lowStockThreshold: product.lowStockThreshold,
        stockAlertEnabled: product.stockAlertEnabled,
        currentStock: product.stock
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Bulk update stock alert settings
export const bulkUpdateStockAlertSettings = async (req, res) => {
  try {
    const { productIds, lowStockThreshold, stockAlertEnabled } = req.body;

    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs array is required'
      });
    }

    const updateData = {};
    if (lowStockThreshold !== undefined) {
      updateData.lowStockThreshold = parseInt(lowStockThreshold);
    }
    if (stockAlertEnabled !== undefined) {
      updateData.stockAlertEnabled = stockAlertEnabled;
    }

    const result = await ProductModel.updateMany(
      { _id: { $in: productIds } },
      updateData
    );

    res.status(200).json({
      success: true,
      message: 'Stock alert settings updated successfully',
      data: {
        modifiedCount: result.modifiedCount,
        totalProducts: productIds.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get stock alert statistics
export const getStockAlertStats = async (req, res) => {
  try {
    const stats = await stockMonitoringService.getLowStockStats();
    const monitoringStatus = stockMonitoringService.getStatus();

    // Get products that need immediate attention
    const criticalProducts = await ProductModel.find({
      stockAlertEnabled: true,
      isActive: true,
      stock: 0
    }).populate('category', 'name')
      .limit(5)
      .select('productName stock category');

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        criticalProducts: criticalProducts.map(p => ({
          productName: p.productName,
          stock: p.stock,
          category: p.category?.name
        })),
        monitoringStatus
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};




// Debug endpoint to check all products
export const debugAllProducts = async (req, res) => {
  try {
    const allProducts = await ProductModel.find({})
      .select('productName stock lowStockThreshold stockAlertEnabled isActive')
      .limit(20);
    
    console.log('🔍 All Products Debug:', allProducts.length);
    
    res.status(200).json({
      success: true,
      data: {
        totalProducts: allProducts.length,
        products: allProducts.map(product => ({
          _id: product._id,
          productName: product.productName,
          stock: product.stock,
          lowStockThreshold: product.lowStockThreshold,
          stockAlertEnabled: product.stockAlertEnabled,
          isActive: product.isActive,
          shouldShowInAlerts: product.stockAlertEnabled && product.isActive && product.stock <= product.lowStockThreshold
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Control stock monitoring service
export const controlStockMonitoring = async (req, res) => {
  try {
    const { action } = req.body; // 'start', 'stop', 'status'

    switch (action) {
      case 'start':
        stockMonitoringService.startMonitoring();
        res.status(200).json({
          success: true,
          message: 'Stock monitoring started',
          data: stockMonitoringService.getStatus()
        });
        break;

      case 'stop':
        stockMonitoringService.stopMonitoring();
        res.status(200).json({
          success: true,
          message: 'Stock monitoring stopped',
          data: stockMonitoringService.getStatus()
        });
        break;

      case 'status':
        res.status(200).json({
          success: true,
          data: stockMonitoringService.getStatus()
        });
        break;

      default:
        res.status(400).json({
          success: false,
          message: 'Invalid action. Use: start, stop, or status'
        });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Reset lastStockAlertSent for testing (force daily alerts)
export const resetStockAlertTimestamps = async (req, res) => {
  try {
    const { productId } = req.params;
    
    if (productId) {
      // Reset for specific product
      const product = await ProductModel.findByIdAndUpdate(
        productId,
        { $unset: { lastStockAlertSent: 1 } },
        { new: true }
      );
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Stock alert timestamp reset for product',
        data: {
          productName: product.productName,
          productId: product._id
        }
      });
    } else {
      // Reset for all products with low stock
      const result = await ProductModel.updateMany(
        {
          stockAlertEnabled: true,
          isActive: true,
          $expr: { $lte: ['$stock', '$lowStockThreshold'] }
        },
        { $unset: { lastStockAlertSent: 1 } }
      );
      
      res.status(200).json({
        success: true,
        message: 'Stock alert timestamps reset for all low stock products',
        data: {
          modifiedCount: result.modifiedCount
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Control daily cron job
export const controlDailyCronJob = async (req, res) => {
  try {
    const { action } = req.body; // 'start', 'stop', 'status'

    switch (action) {
      case 'start':
        cronJobService.startDailyStockAlert();
        res.status(200).json({
          success: true,
          message: 'Daily stock report cron job started',
          data: cronJobService.getStatus()
        });
        break;

      case 'stop':
        cronJobService.stopDailyStockAlert();
        res.status(200).json({
          success: true,
          message: 'Daily stock report cron job stopped',
          data: cronJobService.getStatus()
        });
        break;

      case 'status':
        res.status(200).json({
          success: true,
          data: cronJobService.getStatus()
        });
        break;

      default:
        res.status(400).json({
          success: false,
          message: 'Invalid action. Use: start, stop, or status'
        });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

