import Promo from '../../models/promo.js';
import Order from '../../models/order.js';
import User from '../../models/user.js';

// Get all promos
export const getAllPromos = async (req, res) => {
  try {
    const promos = await Promo.find()
      .populate('applicableCategories', 'name')
      .populate('applicableProducts', 'productName')
      .populate('applicableUsers', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: promos
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch promos',
      error: error.message
    });
  }
};

// Create new promo
export const createPromo = async (req, res) => {
  try {
    const promoData = req.body;

    // Check if promo code already exists
    const existingPromo = await Promo.findOne({ code: promoData.code.toUpperCase() });
    if (existingPromo) {
      return res.status(400).json({
        success: false,
        message: 'Promo code already exists'
      });
    }

    const promo = new Promo({
      ...promoData,
      code: promoData.code.toUpperCase()
    });

    await promo.save();

    res.json({
      success: true,
      message: 'Promo created successfully',
      data: promo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create promo',
      error: error.message
    });
  }
};

// Update promo
export const updatePromo = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }

    const promo = await Promo.findByIdAndUpdate(
      id,
      { ...updateData },
      { new: true, runValidators: true }
    );

    if (!promo) {
      return res.status(404).json({
        success: false,
        message: 'Promo not found'
      });
    }

    res.json({
      success: true,
      message: 'Promo updated successfully',
      data: promo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update promo',
      error: error.message
    });
  }
};

// Delete promo
export const deletePromo = async (req, res) => {
  try {
    const { id } = req.params;

    const promo = await Promo.findByIdAndDelete(id);

    if (!promo) {
      return res.status(404).json({
        success: false,
        message: 'Promo not found'
      });
    }

    res.json({
      success: true,
      message: 'Promo deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete promo',
      error: error.message
    });
  }
};

// Get promo analytics (including deleted promos)
export const getPromoAnalytics = async (req, res) => {
  try {
    const { promoId } = req.params;

    // Try to find promo in database
    let promo = await Promo.findById(promoId);
    let isDeleted = false;

    // If promo not found, check if it's a deleted promo (has orders with this promoId)
    if (!promo) {
      const ordersWithPromo = await Order.find({ promoId }).select('promoCode createdAt').sort({ createdAt: 1 });
      if (ordersWithPromo.length > 0) {
        // This is a deleted promo, create a mock promo object from order data
        isDeleted = true;
        const promoCode = ordersWithPromo[0].promoCode || 'PROMO';
        promo = {
          _id: promoId,
          code: promoCode,
          name: promoCode, // Use promo code as name since original name is not available
          description: promoCode,
          type: 'percentage',
          value: 0,
          minimumAmount: 0,
          usedCount: 0,
          validFrom: ordersWithPromo[0].createdAt || new Date(),
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
          message: 'Promo not found'
        });
      }
    }

    // Convert promoId to ObjectId if it's a string
    const mongoose = (await import('mongoose')).default;
    const promoObjectId = mongoose.Types.ObjectId.isValid(promoId) 
      ? new mongoose.Types.ObjectId(promoId) 
      : promoId;

    // Get orders with this promo (by promoId, not promoCode to avoid old data)
    const orders = await Order.find({
      promoId: promoObjectId
    })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    // Calculate statistics
    const stats = await Order.aggregate([
      {
        $match: {
          promoId: promoObjectId
        }
      },
      {
        $group: {
          _id: null,
          totalUsage: { $sum: 1 },
          totalDiscount: { $sum: { $ifNull: ['$promoDiscount', 0] } },
          totalRevenue: { $sum: '$total' },
          uniqueUsers: { $addToSet: '$user' },
          averageOrderValue: { $avg: '$total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        promo: promo.toObject(),
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
          discountAmount: order.promoDiscount || 0,
          orderTotal: order.total,
          orderDate: order.createdAt,
          orderStatus: order.orderStatus
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch promo analytics',
      error: error.message
    });
  }
};

// Get all promos with usage statistics (including deleted promos for analytics)
export const getPromosWithStats = async (req, res) => {
  try {
    // Get all existing promos
    const promos = await Promo.find().sort({ createdAt: -1 });

    // Get all unique promoIds from orders (including deleted promos)
    const mongoose = (await import('mongoose')).default;
    const ordersWithPromos = await Order.distinct('promoId', {
      promoId: { $ne: null }
    });

    // Get promo details for existing promos - convert to string for comparison
    const existingPromoIds = new Set(promos.map(p => p._id.toString()));
    
    // Filter deleted promoIds - those that exist in orders but not in existing promos
    const deletedPromoIds = ordersWithPromos.filter(id => {
      if (!id) return false;
      const idString = id.toString();
      return !existingPromoIds.has(idString);
    });

    // Get analytics for existing promos
    const promosWithStats = await Promise.all(
      promos.map(async (promo) => {
        // Use promoId instead of promoCode to get accurate stats for current promo
        const orders = await Order.countDocuments({
          promoId: promo._id
        });

        const revenue = await Order.aggregate([
          {
            $match: {
              promoId: promo._id
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$total' },
              discount: { $sum: { $ifNull: ['$promoDiscount', 0] } }
            }
          }
        ]);

        return {
          ...promo.toObject(),
          usageCount: orders,
          totalRevenue: revenue[0]?.total || 0,
          totalDiscount: revenue[0]?.discount || 0,
          isExpired: promo.validUntil && new Date() > promo.validUntil,
          isActive: promo.isValid()
        };
      })
    );

    // Get analytics for deleted promos (from orders only)
    // Get all unique promo codes for deleted promos
    const deletedPromosWithStats = await Promise.all(
      deletedPromoIds.map(async (promoId) => {
        // Convert promoId to ObjectId for query
        const promoObjectId = mongoose.Types.ObjectId.isValid(promoId) 
          ? new mongoose.Types.ObjectId(promoId) 
          : promoId;
        
        // Get all orders with this promoId to get promo code
        const ordersWithPromo = await Order.find({ promoId: promoObjectId }).select('promoCode createdAt').sort({ createdAt: 1 });
        
        // Get promo code from any order (all should have same promo code for same promoId)
        const promoCode = ordersWithPromo[0]?.promoCode || 'PROMO';

        const orders = await Order.countDocuments({
          promoId: promoObjectId
        });

        const revenue = await Order.aggregate([
          {
            $match: {
              promoId: promoObjectId
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$total' },
              discount: { $sum: { $ifNull: ['$promoDiscount', 0] } }
            }
          }
        ]);

        return {
          _id: promoId,
          code: promoCode,
          name: promoCode, // Use promo code as name since original name is not available
          description: promoCode,
          type: 'percentage',
          value: 0,
          minimumAmount: 0,
          usageCount: orders,
          totalRevenue: revenue[0]?.total || 0,
          totalDiscount: revenue[0]?.discount || 0,
          isExpired: true,
          isActive: false,
          isDeleted: true,
          createdAt: ordersWithPromo[0]?.createdAt || new Date(),
          updatedAt: ordersWithPromo[0]?.createdAt || new Date()
        };
      })
    );

    // Combine existing and deleted promos, sort by createdAt
    const allPromosWithStats = [...promosWithStats, ...deletedPromosWithStats].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // Sort descending
    });

    res.json({
      success: true,
      data: allPromosWithStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch promos with statistics',
      error: error.message
    });
  }
};

export default {
  getAllPromos,
  createPromo,
  updatePromo,
  deletePromo,
  getPromoAnalytics,
  getPromosWithStats
};

