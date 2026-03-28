import Warranty from '../../models/warranty.js';
import Order from '../../models/order.js';
import Product from '../../models/product.js';
import User from '../../models/user.js';

// Get overall warranty statistics
export const getWarrantyStats = async (req, res) => {
  try {
    // Total warranties
    const totalWarranties = await Warranty.countDocuments();
    const activeWarranties = await Warranty.countDocuments({ isActive: true });
    
    // Total warranties sold
    const ordersWithWarranty = await Order.find({
      'items.warranty': { $exists: true, $ne: null }
    });
    
    let totalSold = 0;
    let totalRevenue = 0;
    let activeWarrantiesCount = 0;
    let expiredWarrantiesCount = 0;
    const now = new Date();
    
    // Process all orders and items with proper async handling
    for (const order of ordersWithWarranty) {
      for (const item of order.items) {
        if (item.warranty) {
          totalSold++;
          const warranty = await Warranty.findById(item.warranty);
          if (warranty) {
            totalRevenue += warranty.price;
            
            // Calculate expiry date (order date + warranty duration)
            const orderDate = new Date(order.createdAt);
            const expiryDate = new Date(orderDate);
            expiryDate.setMonth(expiryDate.getMonth() + warranty.duration);
            
            if (expiryDate > now) {
              activeWarrantiesCount++;
            } else {
              expiredWarrantiesCount++;
            }
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        totalWarranties,
        activeWarranties,
        totalSold,
        totalRevenue,
        activeWarrantiesCount,
        expiredWarrantiesCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch warranty stats', error: error.message });
  }
};

// Get user-wise warranty details
export const getUserWarranties = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Get all orders with warranties
    const orders = await Order.find({
      'items.warranty': { $exists: true, $ne: null }
    })
      .populate('user', 'name email phone')
      .populate('items.product', 'productName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    // Group by user
    const userWarrantyMap = new Map();
    const now = new Date();
    
    for (const order of orders) {
      const userId = order.user?._id?.toString() || 'guest';
      const userName = order.user?.name || 'Guest User';
      const userEmail = order.user?.email || '';
      const userPhone = order.user?.phone || '';
      
      if (!userWarrantyMap.has(userId)) {
        userWarrantyMap.set(userId, {
          userId,
          userName,
          userEmail,
          userPhone,
          totalWarranties: 0,
          activeWarranties: 0,
          expiredWarranties: 0,
          totalSpent: 0,
          warranties: []
        });
      }
      
      const userData = userWarrantyMap.get(userId);
      
      for (const item of order.items) {
        if (item.warranty) {
          const warranty = await Warranty.findById(item.warranty);
          if (warranty) {
            userData.totalWarranties++;
            userData.totalSpent += warranty.price;
            
            const orderDate = new Date(order.createdAt);
            const expiryDate = new Date(orderDate);
            expiryDate.setMonth(expiryDate.getMonth() + warranty.duration);
            
            const isExpired = expiryDate < now;
            
            if (isExpired) {
              userData.expiredWarranties++;
            } else {
              userData.activeWarranties++;
            }
            
            userData.warranties.push({
              warrantyId: warranty._id,
              warrantyName: warranty.name,
              productName: item.product?.productName || 'N/A',
              orderId: order._id,
              orderNumber: order.orderNumber,
              purchaseDate: order.createdAt,
              expiryDate,
              status: isExpired ? 'expired' : 'active',
              price: warranty.price
            });
          }
        }
      }
    }
    
    const userWarranties = Array.from(userWarrantyMap.values());
    const total = userWarrantyMap.size;
    
    res.json({
      success: true,
      data: userWarranties,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch user warranties', error: error.message });
  }
};

// Get product-wise warranty sales
export const getProductWarranties = async (req, res) => {
  try {
    const orders = await Order.find({
      'items.warranty': { $exists: true, $ne: null }
    })
      .populate('items.product', 'productName price discountPrice images')
      .populate('items.warranty', 'name price duration');
    
    const productWarrantyMap = new Map();
    
    for (const order of orders) {
      for (const item of order.items) {
        if (item.warranty && item.product) {
          const productId = item.product._id.toString();
          
          if (!productWarrantyMap.has(productId)) {
            productWarrantyMap.set(productId, {
              productId,
              productName: item.product.productName,
              productPrice: item.product.discountPrice || item.product.price,
              productImage: item.product.images?.[0] || '',
              totalWarrantiesSold: 0,
              totalRevenue: 0,
              warranties: []
            });
          }
          
          const productData = productWarrantyMap.get(productId);
          productData.totalWarrantiesSold++;
          
          if (item.warranty && typeof item.warranty === 'object') {
            productData.totalRevenue += item.warranty.price;
            
            const existingWarranty = productData.warranties.find(
              w => w.warrantyId.toString() === item.warranty._id.toString()
            );
            
            if (existingWarranty) {
              existingWarranty.count++;
              existingWarranty.revenue += item.warranty.price;
            } else {
              productData.warranties.push({
                warrantyId: item.warranty._id,
                warrantyName: item.warranty.name,
                price: item.warranty.price,
                duration: item.warranty.duration,
                count: 1,
                revenue: item.warranty.price
              });
            }
          }
        }
      }
    }
    
    const productWarranties = Array.from(productWarrantyMap.values());
    
    res.json({ success: true, data: productWarranties });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch product warranties', error: error.message });
  }
};

// Get specific warranty analytics
export const getWarrantyAnalytics = async (req, res) => {
  try {
    const { warrantyId } = req.params;
    
    const warranty = await Warranty.findById(warrantyId);
    if (!warranty) {
      return res.status(404).json({ success: false, message: 'Warranty not found' });
    }
    
    // Get all orders with this warranty
    const orders = await Order.find({
      'items.warranty': warrantyId
    })
      .populate('user', 'name email')
      .populate('items.product', 'productName')
      .sort({ createdAt: -1 });
    
    let totalUsage = 0;
    let totalRevenue = 0;
    let activeCount = 0;
    let expiredCount = 0;
    const now = new Date();
    const orderDetails = [];
    
    for (const order of orders) {
      for (const item of order.items) {
        if (item.warranty && item.warranty.toString() === warrantyId) {
          totalUsage++;
          totalRevenue += warranty.price;
          
          const orderDate = new Date(order.createdAt);
          const expiryDate = new Date(orderDate);
          expiryDate.setMonth(expiryDate.getMonth() + warranty.duration);
          
          const isExpired = expiryDate < now;
          
          if (isExpired) {
            expiredCount++;
          } else {
            activeCount++;
          }
          
          orderDetails.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            user: order.user,
            product: item.product,
            purchaseDate: order.createdAt,
            expiryDate,
            status: isExpired ? 'expired' : 'active',
            price: warranty.price
          });
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        warranty: {
          _id: warranty._id,
          name: warranty.name,
          description: warranty.description,
          duration: warranty.duration,
          price: warranty.price,
          coverage: warranty.coverage
        },
        summary: {
          totalUsage,
          totalRevenue,
          activeCount,
          expiredCount,
          uniqueUsers: new Set(orders.map(o => o.user?._id?.toString()).filter(Boolean)).size
        },
        orders: orderDetails
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch warranty analytics', error: error.message });
  }
};

