import Order from '../../models/order.js';
import Coupon from '../../models/coupon.js';
import User from '../../models/user.js';
import Product from '../../models/product.js';

// Get Coupon Control Panel Analytics
export const getCouponAnalytics = async (req, res) => {
  try {
    // 1. Orders with coupons applied
    const ordersWithCoupons = await Order.find({
      couponCode: { $exists: true, $ne: null }
    })
      .populate('user', 'name email')
      .populate('items.product', 'productName')
      .sort({ createdAt: -1 })
      .limit(1000); // Limit for performance

    // 2. Coupon usage by user
    const couponUsageByUser = await Order.aggregate([
      {
        $match: {
          couponCode: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$user',
          couponCodes: { $addToSet: '$couponCode' },
          totalOrders: { $sum: 1 },
          totalDiscount: { $sum: { $ifNull: ['$couponDiscount', 0] } }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $unwind: {
          path: '$userInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          userId: '$_id',
          userName: { $ifNull: ['$userInfo.name', 'Unknown'] },
          userEmail: { $ifNull: ['$userInfo.email', 'N/A'] },
          couponCodes: 1,
          totalOrders: 1,
          totalDiscount: 1,
          uniqueCouponsUsed: { $size: '$couponCodes' }
        }
      },
      {
        $sort: { totalOrders: -1 }
      }
    ]);

    // 3. Coupon usage by coupon code
    const couponUsageByCode = await Order.aggregate([
      {
        $match: {
          couponCode: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$couponCode',
          totalUsage: { $sum: 1 },
          totalDiscount: { $sum: { $ifNull: ['$couponDiscount', 0] } },
          totalRevenue: { $sum: '$total' },
          uniqueUsers: { $addToSet: '$user' }
        }
      },
      {
        $project: {
          couponCode: '$_id',
          totalUsage: 1,
          totalDiscount: 1,
          totalRevenue: 1,
          uniqueUsersCount: { $size: '$uniqueUsers' }
        }
      },
      {
        $sort: { totalUsage: -1 }
      }
    ]);

    // 4. Product-wise coupon usage
    const productCouponUsage = await Order.aggregate([
      {
        $match: {
          couponCode: { $exists: true, $ne: null }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: {
            productId: '$items.product',
            couponCode: '$couponCode'
          },
          totalQuantity: { $sum: '$items.quantity' },
          totalDiscount: { $sum: { $ifNull: ['$couponDiscount', 0] } },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $unwind: {
          path: '$productInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          productId: '$_id.productId',
          productName: { $ifNull: ['$productInfo.productName', 'Unknown Product'] },
          couponCode: '$_id.couponCode',
          totalQuantity: 1,
          totalDiscount: 1,
          orderCount: 1
        }
      },
      {
        $sort: { totalQuantity: -1 }
      },
      {
        $limit: 100
      }
    ]);

    // 5. Summary statistics
    const totalOrdersWithCoupons = await Order.countDocuments({
      couponCode: { $exists: true, $ne: null }
    });

    const totalDiscountGiven = await Order.aggregate([
      {
        $match: {
          couponCode: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$couponDiscount', 0] } }
        }
      }
    ]);

    const uniqueCouponsUsed = await Order.distinct('couponCode', {
      couponCode: { $exists: true, $ne: null }
    });

    const uniqueUsersUsedCoupons = await Order.distinct('user', {
      couponCode: { $exists: true, $ne: null }
    });

    // 6. Recent orders with coupons (for table display)
    const recentOrdersWithCoupons = ordersWithCoupons.slice(0, 50).map(order => ({
      orderNumber: order.orderNumber,
      orderId: order._id,
      user: {
        name: order.user?.name || 'Unknown',
        email: order.user?.email || 'N/A'
      },
      couponCode: order.couponCode,
      discountAmount: order.couponDiscount || 0,
      orderTotal: order.total,
      orderDate: order.createdAt,
      orderStatus: order.orderStatus,
      items: order.items.map(item => ({
        productName: item.product?.productName || 'Unknown Product',
        quantity: item.quantity,
        price: item.price
      }))
    }));

    res.json({
      success: true,
      data: {
        summary: {
          totalOrdersWithCoupons,
          totalDiscountGiven: totalDiscountGiven[0]?.total || 0,
          uniqueCouponsUsed: uniqueCouponsUsed.length,
          uniqueUsersUsedCoupons: uniqueUsersUsedCoupons.length
        },
        ordersWithCoupons: recentOrdersWithCoupons,
        couponUsageByUser,
        couponUsageByCode,
        productCouponUsage
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon analytics',
      error: error.message
    });
  }
};

// Get detailed coupon usage for a specific coupon code
export const getCouponDetails = async (req, res) => {
  try {
    const { couponCode } = req.params;

    if (!couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required'
      });
    }

    // Get coupon details
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Get all orders with this coupon
    const orders = await Order.find({ couponCode: couponCode.toUpperCase() })
      .populate('user', 'name email')
      .populate('items.product', 'productName')
      .sort({ createdAt: -1 });

    // Aggregate statistics
    const stats = await Order.aggregate([
      {
        $match: {
          couponCode: couponCode.toUpperCase()
        }
      },
      {
        $group: {
          _id: null,
          totalUsage: { $sum: 1 },
          totalDiscount: { $sum: { $ifNull: ['$couponDiscount', 0] } },
          totalRevenue: { $sum: '$total' },
          uniqueUsers: { $addToSet: '$user' },
          averageOrderValue: { $avg: '$total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        coupon: coupon.toObject(),
        orders: orders.map(order => ({
          orderNumber: order.orderNumber,
          user: {
            name: order.user?.name || 'Unknown',
            email: order.user?.email || 'N/A'
          },
          discountAmount: order.couponDiscount || 0,
          orderTotal: order.total,
          orderDate: order.createdAt,
          orderStatus: order.orderStatus
        })),
        statistics: stats[0] ? {
          totalUsage: stats[0].totalUsage,
          totalDiscount: stats[0].totalDiscount,
          totalRevenue: stats[0].totalRevenue,
          uniqueUsersCount: stats[0].uniqueUsers.length,
          averageOrderValue: stats[0].averageOrderValue
        } : {
          totalUsage: 0,
          totalDiscount: 0,
          totalRevenue: 0,
          uniqueUsersCount: 0,
          averageOrderValue: 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon details',
      error: error.message
    });
  }
};

export default {
  getCouponAnalytics,
  getCouponDetails
};

