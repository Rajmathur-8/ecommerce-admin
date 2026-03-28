import GiftVoucher from '../../models/giftVoucher.js';
import Order from '../../models/order.js';
import User from '../../models/user.js';

// Get all gift vouchers
export const getAllGiftVouchers = async (req, res) => {
  try {
    const giftVouchers = await GiftVoucher.find()
      .populate('applicableCategories', 'name')
      .populate('applicableProducts', 'productName')
      .populate('applicableUsers', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: giftVouchers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gift vouchers',
      error: error.message
    });
  }
};

// Create new gift voucher
export const createGiftVoucher = async (req, res) => {
  try {
    const giftVoucherData = req.body;

    // Check if gift voucher code already exists
    const existingGiftVoucher = await GiftVoucher.findOne({ code: giftVoucherData.code.toUpperCase() });
    if (existingGiftVoucher) {
      return res.status(400).json({
        success: false,
        message: 'Gift voucher code already exists'
      });
    }

    const giftVoucher = new GiftVoucher({
      ...giftVoucherData,
      code: giftVoucherData.code.toUpperCase()
    });

    await giftVoucher.save();

    res.json({
      success: true,
      message: 'Gift voucher created successfully',
      data: giftVoucher
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create gift voucher',
      error: error.message
    });
  }
};

// Update gift voucher
export const updateGiftVoucher = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }

    const giftVoucher = await GiftVoucher.findByIdAndUpdate(
      id,
      { ...updateData },
      { new: true, runValidators: true }
    );

    if (!giftVoucher) {
      return res.status(404).json({
        success: false,
        message: 'Gift voucher not found'
      });
    }

    res.json({
      success: true,
      message: 'Gift voucher updated successfully',
      data: giftVoucher
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update gift voucher',
      error: error.message
    });
  }
};

// Delete gift voucher
export const deleteGiftVoucher = async (req, res) => {
  try {
    const { id } = req.params;

    const giftVoucher = await GiftVoucher.findByIdAndDelete(id);

    if (!giftVoucher) {
      return res.status(404).json({
        success: false,
        message: 'Gift voucher not found'
      });
    }

    res.json({
      success: true,
      message: 'Gift voucher deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete gift voucher',
      error: error.message
    });
  }
};

// Get gift voucher analytics (including deleted gift vouchers)
export const getGiftVoucherAnalytics = async (req, res) => {
  try {
    const { giftVoucherId } = req.params;

    // Try to find gift voucher in database
    let giftVoucher = await GiftVoucher.findById(giftVoucherId);
    let isDeleted = false;

    // If gift voucher not found, check if it's a deleted gift voucher (has orders with this giftVoucherId)
    if (!giftVoucher) {
      const ordersWithGiftVoucher = await Order.find({ giftVoucherId }).select('giftVoucherCode createdAt').sort({ createdAt: 1 });
      if (ordersWithGiftVoucher.length > 0) {
        // This is a deleted gift voucher, create a mock gift voucher object from order data
        isDeleted = true;
        const giftVoucherCode = ordersWithGiftVoucher[0].giftVoucherCode || 'GIFT';
        giftVoucher = {
          _id: giftVoucherId,
          code: giftVoucherCode,
          name: giftVoucherCode, // Use gift voucher code as name since original name is not available
          description: giftVoucherCode,
          type: 'percentage',
          value: 0,
          minimumAmount: 0,
          usedCount: 0,
          validFrom: ordersWithGiftVoucher[0].createdAt || new Date(),
          validUntil: null,
          isActive: false,
          toObject: function() {
            return {
              _id: this._id,
              code: this.code,
              name: this.name,
              description: this.description,
              type: this.type,
              value: this.value,
              minimumAmount: this.minimumAmount,
              usedCount: this.usedCount,
              validFrom: this.validFrom,
              validUntil: this.validUntil,
              isActive: this.isActive
            };
          }
        };
      } else {
        return res.status(404).json({
          success: false,
          message: 'Gift voucher not found'
        });
      }
    }

    // Convert giftVoucherId to ObjectId if it's a string
    const mongoose = (await import('mongoose')).default;
    const giftVoucherObjectId = mongoose.Types.ObjectId.isValid(giftVoucherId) 
      ? new mongoose.Types.ObjectId(giftVoucherId) 
      : giftVoucherId;

    // Get orders with this gift voucher (by giftVoucherId, not giftVoucherCode to avoid old data)
    const orders = await Order.find({
      giftVoucherId: giftVoucherObjectId
    })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    // Calculate statistics
    const stats = await Order.aggregate([
      {
        $match: {
          giftVoucherId: giftVoucherObjectId
        }
      },
      {
        $group: {
          _id: null,
          totalUsage: { $sum: 1 },
          totalDiscount: { $sum: { $ifNull: ['$giftVoucherDiscount', 0] } },
          totalRevenue: { $sum: '$total' },
          uniqueUsers: { $addToSet: '$user' },
          averageOrderValue: { $avg: '$total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        giftVoucher: giftVoucher.toObject(),
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
        },
        orders: orders.slice(0, 50).map(order => ({
          orderNumber: order.orderNumber,
          user: {
            name: order.user?.name || 'Unknown',
            email: order.user?.email || 'N/A'
          },
          discountAmount: order.giftVoucherDiscount || 0,
          orderTotal: order.total,
          orderDate: order.createdAt,
          orderStatus: order.orderStatus
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gift voucher analytics',
      error: error.message
    });
  }
};

// Get all gift vouchers with usage statistics (including deleted gift vouchers for analytics)
export const getGiftVouchersWithStats = async (req, res) => {
  try {
    // Get all existing gift vouchers
    const giftVouchers = await GiftVoucher.find().sort({ createdAt: -1 });

    // Get all unique giftVoucherIds from orders (including deleted gift vouchers)
    const mongoose = (await import('mongoose')).default;
    const ordersWithGiftVouchers = await Order.distinct('giftVoucherId', {
      giftVoucherId: { $ne: null }
    });

    // Get gift voucher details for existing gift vouchers - convert to string for comparison
    const existingGiftVoucherIds = new Set(giftVouchers.map(gv => gv._id.toString()));
    
    // Filter deleted giftVoucherIds - those that exist in orders but not in existing gift vouchers
    const deletedGiftVoucherIds = ordersWithGiftVouchers.filter(id => {
      if (!id) return false;
      const idString = id.toString();
      return !existingGiftVoucherIds.has(idString);
    });

    // Get analytics for existing gift vouchers
    const giftVouchersWithStats = await Promise.all(
      giftVouchers.map(async (giftVoucher) => {
        // Use giftVoucherId instead of giftVoucherCode to get accurate stats for current voucher
        const orders = await Order.countDocuments({
          giftVoucherId: giftVoucher._id
        });

        const revenue = await Order.aggregate([
          {
            $match: {
              giftVoucherId: giftVoucher._id
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$total' },
              discount: { $sum: { $ifNull: ['$giftVoucherDiscount', 0] } }
            }
          }
        ]);

        return {
          ...giftVoucher.toObject(),
          usageCount: orders,
          totalRevenue: revenue[0]?.total || 0,
          totalDiscount: revenue[0]?.discount || 0,
          isExpired: giftVoucher.validUntil && new Date() > giftVoucher.validUntil,
          isActive: giftVoucher.isValid()
        };
      })
    );

    // Get analytics for deleted gift vouchers (from orders only)
    const deletedGiftVouchersWithStats = await Promise.all(
      deletedGiftVoucherIds.map(async (giftVoucherId) => {
        // Convert giftVoucherId to ObjectId for query
        const giftVoucherObjectId = mongoose.Types.ObjectId.isValid(giftVoucherId) 
          ? new mongoose.Types.ObjectId(giftVoucherId) 
          : giftVoucherId;
        
        // Get all orders with this giftVoucherId to get gift voucher code
        const ordersWithGiftVoucher = await Order.find({ giftVoucherId: giftVoucherObjectId }).select('giftVoucherCode createdAt').sort({ createdAt: 1 });
        
        // Get gift voucher code from any order (all should have same gift voucher code for same giftVoucherId)
        const giftVoucherCode = ordersWithGiftVoucher[0]?.giftVoucherCode || 'GIFT';

        const orders = await Order.countDocuments({
          giftVoucherId: giftVoucherObjectId
        });

        const revenue = await Order.aggregate([
          {
            $match: {
              giftVoucherId: giftVoucherObjectId
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$total' },
              discount: { $sum: { $ifNull: ['$giftVoucherDiscount', 0] } }
            }
          }
        ]);

        return {
          _id: giftVoucherId,
          code: giftVoucherCode,
          name: giftVoucherCode, // Use gift voucher code as name since original name is not available
          description: giftVoucherCode,
          type: 'percentage',
          value: 0,
          minimumAmount: 0,
          usageCount: orders,
          totalRevenue: revenue[0]?.total || 0,
          totalDiscount: revenue[0]?.discount || 0,
          isExpired: true,
          isActive: false,
          isDeleted: true,
          createdAt: ordersWithGiftVoucher[0]?.createdAt || new Date(),
          updatedAt: ordersWithGiftVoucher[0]?.createdAt || new Date()
        };
      })
    );

    // Combine existing and deleted gift vouchers, sort by createdAt
    const allGiftVouchersWithStats = [...giftVouchersWithStats, ...deletedGiftVouchersWithStats].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // Sort descending
    });

    res.json({
      success: true,
      data: allGiftVouchersWithStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gift vouchers with statistics',
      error: error.message
    });
  }
};

export default {
  getAllGiftVouchers,
  createGiftVoucher,
  updateGiftVoucher,
  deleteGiftVoucher,
  getGiftVoucherAnalytics,
  getGiftVouchersWithStats
};

