import mongoose from 'mongoose';
import UserModel from '../../models/user.js';
import OrderModel from '../../models/order.js';
import RewardPointsModel from '../../models/rewardPoints.js';
import AddressModel from '../../models/address.js';
import RatingModel from '../../models/rating.js';

// Get customer details with stats
export const getCustomerDetails = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page = 1, limit = 5 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 5;
    const skip = (pageNum - 1) * limitNum;

    const customer = await UserModel.findById(customerId)
      .populate('referredBy', 'name email')
      .lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get customer stats
    const customerObjectId = customer._id;
    const totalOrders = await OrderModel.countDocuments({ user: customerObjectId });
    
    // Calculate total spent from all orders (excluding cancelled and returned)
    // Include all order statuses except cancelled and returned to show actual spending
    let totalSpent = 0;
    try {
      const totalSpentResult = await OrderModel.aggregate([
        { 
          $match: { 
            user: customerObjectId, 
            orderStatus: { $nin: ['cancelled', 'returned'] }
          } 
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: '$total' } 
          } 
        }
      ]);
      
      totalSpent = totalSpentResult.length > 0 && totalSpentResult[0].total ? totalSpentResult[0].total : 0;
    } catch (error) {
      console.error('Error calculating total spent:', error);
      totalSpent = 0;
    }

    // Get addresses count - check Address collection first, then orders
    let totalAddresses = 0;
    
    // Check Address collection (for both regular and guest users)
    const addressesCount = await AddressModel.countDocuments({ user: customerObjectId });
    totalAddresses = addressesCount;
    
    // If no addresses in collection, check unique addresses from orders (for guest users)
    if (totalAddresses === 0) {
      const ordersWithAddresses = await OrderModel.find({ user: customerObjectId })
        .select('address')
        .lean();
      
      // Extract unique addresses from orders based on addressLine1, city, and pincode
      const uniqueAddressesSet = new Set();
      ordersWithAddresses.forEach(order => {
        if (order.address && order.address.addressLine1 && order.address.city && order.address.pincode) {
          const addressKey = `${order.address.addressLine1}-${order.address.city}-${order.address.pincode}`;
          uniqueAddressesSet.add(addressKey);
        }
      });
      
      totalAddresses = uniqueAddressesSet.size;
    }
    
    // Get reward points stats
    const rewardPoints = await RewardPointsModel.findOne({ user: customerObjectId });
    const rewardPointsStats = rewardPoints ? {
      currentPoints: rewardPoints.currentPoints,
      totalEarned: rewardPoints.totalEarned,
      totalRedeemed: rewardPoints.totalRedeemed
    } : {
      currentPoints: 0,
      totalEarned: 0,
      totalRedeemed: 0
    };

    // Get total reviews from Rating collection
    const totalReviews = await RatingModel.countDocuments({ 
      user: customerObjectId,
      isActive: true 
    });

    // Get recent orders (order history) with pagination
    const recentOrders = await OrderModel.find({ user: customerObjectId })
      .select('orderNumber orderStatus total createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    // Get total orders count for pagination
    const totalOrdersCount = await OrderModel.countDocuments({ user: customerObjectId });

    const stats = {
      totalOrders,
      totalSpent: totalSpent,
      totalAddresses,
      totalReviews,
      rewardPoints: rewardPointsStats
    };

    // Get addresses for display (from Address collection or orders)
    let customerAddresses = [];
    
    // Fetch from Address collection first
    const addressesFromCollection = await AddressModel.find({ user: customerObjectId })
      .select('name mobile addressLine1 addressLine2 city state pincode country isDefault')
      .lean();
    customerAddresses = addressesFromCollection;
    
    // If no addresses in collection, get unique addresses from orders (for guest users)
    if (customerAddresses.length === 0) {
      const ordersWithAddresses = await OrderModel.find({ user: customerObjectId })
        .select('address')
        .lean();
      
      // Extract unique addresses from orders
      const uniqueAddressesMap = new Map();
      ordersWithAddresses.forEach(order => {
        if (order.address && order.address.addressLine1 && order.address.city && order.address.pincode) {
          const addressKey = `${order.address.addressLine1}-${order.address.city}-${order.address.pincode}`;
          if (!uniqueAddressesMap.has(addressKey)) {
            uniqueAddressesMap.set(addressKey, {
              _id: `order-${order._id}`,
              name: order.address.name || '',
              mobile: order.address.mobile || '',
              addressLine1: order.address.addressLine1 || '',
              addressLine2: order.address.addressLine2 || '',
              city: order.address.city || '',
              state: order.address.state || '',
              pincode: order.address.pincode || '',
              country: order.address.country || 'India',
              isDefault: false
            });
          }
        }
      });
      customerAddresses = Array.from(uniqueAddressesMap.values());
    }
    
    // Update totalAddresses to match the actual addresses array length
    totalAddresses = customerAddresses.length;

    // Transform customer data to match frontend expectations
    const transformedCustomer = {
      ...customer,
      firstName: customer.name ? customer.name.split(' ')[0] : '',
      lastName: customer.name ? customer.name.split(' ').slice(1).join(' ') : '',
      referredBy: customer.referredBy ? {
        _id: customer.referredBy._id,
        firstName: customer.referredBy.name ? customer.referredBy.name.split(' ')[0] : '',
        lastName: customer.referredBy.name ? customer.referredBy.name.split(' ').slice(1).join(' ') : '',
        email: customer.referredBy.email
      } : null,
      addresses: customerAddresses,
      stats,
      recentOrders,
      lastLogin: customer.lastLogin || null,
      ordersPagination: {
        page: pageNum,
        limit: limitNum,
        total: totalOrdersCount,
        pages: Math.ceil(totalOrdersCount / limitNum)
      }
    };

    res.status(200).json({
      success: true,
      data: {
        customer: transformedCustomer
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get customer orders
export const getCustomerOrders = async (req, res) => {
  try {
    const { customerId } = req.params;

    const orders = await OrderModel.find({ user: customerId })
      .populate('items.product', 'productName images price')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        orders
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get customer reward points
export const getCustomerRewardPoints = async (req, res) => {
  try {
    const { customerId } = req.params;

    const rewardPoints = await RewardPointsModel.findOne({ user: customerId })
      .populate('entries.orderId', 'total createdAt')
      .lean();

    if (!rewardPoints) {
      return res.status(200).json({
        success: true,
        data: {
          rewardPoints: {
            _id: null,
            user: customerId,
            entries: [],
            totalEarned: 0,
            totalRedeemed: 0,
            isActive: true,
            currentPoints: 0
          }
        }
      });
    }

    // Transform reward points data to match frontend expectations
    const transformedRewardPoints = {
      ...rewardPoints,
      entries: rewardPoints.entries.map(entry => ({
        ...entry,
        isReferralPoints: false // Default to false since the model doesn't have this field
      }))
    };

    res.status(200).json({
      success: true,
      data: {
        rewardPoints: transformedRewardPoints
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all customers (for admin dashboard)
export const getAllCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Search functionality
    if (search) {
      query = {
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Status filter
    if (status === 'active') {
      query.isActive = true;
      query.isGuest = false;
    } else if (status === 'guest') {
      query.isGuest = true;
    }

    const customers = await UserModel.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get stats for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const totalOrders = await OrderModel.countDocuments({ user: customer._id });
        const totalSpent = await OrderModel.aggregate([
          { 
            $match: { 
              user: customer._id, 
              orderStatus: { $nin: ['cancelled', 'returned'] },
              total: { $gt: 0 } // Only count orders with positive total
            } 
          },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        const rewardPoints = await RewardPointsModel.findOne({ user: customer._id });
        const currentPoints = rewardPoints ? rewardPoints.currentPoints : 0;

        return {
          ...customer,
          stats: {
            totalOrders,
            totalSpent: totalSpent.length > 0 ? totalSpent[0].total : 0,
            rewardPoints: {
              currentPoints
            }
          }
        };
      })
    );

    const total = await UserModel.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        customers: customersWithStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
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

// Update customer details
export const updateCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const updateData = req.body;

    const customer = await UserModel.findByIdAndUpdate(
      customerId,
      updateData,
      { new: true }
    ).populate('referredBy', 'name email');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: {
        customer
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await UserModel.findByIdAndDelete(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Export customers to CSV
export const exportCustomers = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    
    let query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (status && status !== 'all') {
      query.isActive = status === 'active';
    }

    const customers = await UserModel.find(query)
      .populate('referredBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Transform to CSV format
    const csvData = customers.map(customer => ({
      'Customer ID': customer._id,
      'Name': customer.name || customer.displayName || '',
      'Email': customer.email || '',
      'Phone': customer.phone || '',
      'Status': customer.isActive ? 'Active' : 'Inactive',
      'Registration Date': new Date(customer.createdAt).toLocaleDateString('en-IN'),
      'Total Orders': 0, // This would need to be calculated
      'Total Spent': 0, // This would need to be calculated
      'Referral Code': customer.referralCode || '',
      'Referred By': customer.referredBy?.name || ''
    }));

    res.status(200).json({
      success: true,
      data: {
        customers: csvData,
        filename: `customers_${new Date().toISOString().split('T')[0]}.csv`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get customer statistics
export const getCustomerStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await UserModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          activeCustomers: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactiveCustomers: { $sum: { $cond: ['$isActive', 0, 1] } }
        }
      }
    ]);

    // Get daily customer registrations for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyRegistrations = await UserModel.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: stats[0] || {
          totalCustomers: 0,
          activeCustomers: 0,
          inactiveCustomers: 0
        },
        dailyRegistrations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
