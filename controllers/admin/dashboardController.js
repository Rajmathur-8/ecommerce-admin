import Order from '../../models/order.js';
import Product from '../../models/product.js';
import User from '../../models/user.js';
import Transaction from '../../models/transaction.js';
import { startOfMonth, endOfMonth, subMonths, format, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';

// Get Dashboard Stats
const getDashboardStats = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = startOfMonth(currentDate);
    const lastMonth = startOfMonth(subMonths(currentDate, 1));

    // Current month data
    const currentMonthRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: currentMonth } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const currentMonthOrders = await Order.countDocuments({ createdAt: { $gte: currentMonth } });
    const currentMonthCustomers = await User.countDocuments({ createdAt: { $gte: currentMonth } });
    const currentMonthProducts = await Product.countDocuments({ createdAt: { $gte: currentMonth } });

    // Last month data
    const lastMonthRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: lastMonth, $lt: currentMonth } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const lastMonthOrders = await Order.countDocuments({ 
      createdAt: { $gte: lastMonth, $lt: currentMonth } 
    });
    const lastMonthCustomers = await User.countDocuments({ 
      createdAt: { $gte: lastMonth, $lt: currentMonth } 
    });
    const lastMonthProducts = await Product.countDocuments({ 
      createdAt: { $gte: lastMonth, $lt: currentMonth } 
    });

    // Total data
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    const totalOrders = await Order.countDocuments();
    const totalCustomers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();

    // Calculate changes
    const revenueChange = lastMonthRevenue[0]?.total 
      ? ((currentMonthRevenue[0]?.total || 0) - lastMonthRevenue[0].total) / lastMonthRevenue[0].total * 100
      : 0;

    const ordersChange = lastMonthOrders 
      ? ((currentMonthOrders - lastMonthOrders) / lastMonthOrders) * 100
      : 0;

    const customersChange = lastMonthCustomers 
      ? ((currentMonthCustomers - lastMonthCustomers) / lastMonthCustomers) * 100
      : 0;

    const productsChange = lastMonthProducts 
      ? ((currentMonthProducts - lastMonthProducts) / lastMonthProducts) * 100
      : 0;

    const stats = {
      totalRevenue: totalRevenue[0]?.total || 0,
      totalOrders,
      totalCustomers,
      totalProducts,
      revenueChange: Math.round(revenueChange * 10) / 10,
      ordersChange: Math.round(ordersChange * 10) / 10,
      customersChange: Math.round(customersChange * 10) / 10,
      productsChange: Math.round(productsChange * 10) / 10,
      currentMonthRevenue: currentMonthRevenue[0]?.total || 0,
      currentMonthOrders,
      currentMonthCustomers,
      currentMonthProducts
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};

// Get Recent Orders
const getRecentOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .populate('items.product', 'productName')
      .sort({ createdAt: -1 })
      .limit(5);

    const formattedOrders = orders.map(order => {
      // Use address name as fallback if user data is missing
      const customerName = order.user?.name || order.address?.name || 'Guest Customer';
      const customerEmail = order.user?.email || order.address?.mobile || 'No email';
      
      return {
        _id: order._id,
        orderNumber: order.orderNumber || `ORD-${order._id.toString().slice(-6).toUpperCase()}`,
        customer: {
          name: customerName,
          email: customerEmail,
          phone: order.user?.phone || order.address?.mobile || 'N/A'
        },
        totalAmount: order.total,
        status: order.orderStatus,
        createdAt: order.createdAt,
        items: order.items.map(item => ({
          product: {
            productName: item.product?.productName || 'Unknown Product'
          },
          quantity: item.quantity
        }))
      };
    });

    res.json({ success: true, data: formattedOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch recent orders' });
  }
};

// Get Top Products
const getTopProducts = async (req, res) => {
  try {
    const topProducts = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSales: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          totalOrders: { $addToSet: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: '$product._id',
          productName: '$product.productName',
          totalSales: 1,
          totalRevenue: 1,
          totalOrders: { $size: '$totalOrders' },
          averageRating: { $ifNull: ['$product.averageRating', 4.0] }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 }
    ]);

    res.json({ success: true, data: topProducts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch top products' });
  }
};

// Get Sales Chart Data
const getSalesChartData = async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    let days = 7;
    
    if (period === '30days') days = 30;
    else if (period === '90days') days = 90;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Fill missing dates with zero values
    const dateMap = {};
    salesData.forEach(item => {
      dateMap[item._id.date] = {
        date: item._id.date,
        revenue: item.revenue,
        orders: item.orders
      };
    });

    const filledData = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      filledData.push({
        date: dateStr,
        revenue: dateMap[dateStr]?.revenue || 0,
        orders: dateMap[dateStr]?.orders || 0,
        formattedDate: format(date, 'dd MMM') // Add formatted date for frontend
      });
    }

    // Calculate total revenue for the period
    const periodTotalRevenue = filledData.reduce((sum, item) => sum + item.revenue, 0);

    res.json({ 
      success: true, 
      data: filledData,
      totalRevenue: periodTotalRevenue,
      period: period
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch sales chart data' });
  }
};

// Get Performance Metrics
const getPerformanceMetrics = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonth = startOfMonth(currentDate);

    // Average Order Value
    const aovData = await Order.aggregate([
      { $match: { createdAt: { $gte: currentMonth } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    const averageOrderValue = aovData[0] 
      ? aovData[0].totalRevenue / aovData[0].totalOrders 
      : 0;

    // Customer Retention Rate (simplified calculation)
    const totalCustomers = await User.countDocuments();
    const repeatCustomers = await Order.aggregate([
      {
        $group: {
          _id: '$user',
          orderCount: { $sum: 1 }
        }
      },
      {
        $match: {
          orderCount: { $gt: 1 }
        }
      }
    ]);

    const customerRetentionRate = totalCustomers > 0 
      ? (repeatCustomers.length / totalCustomers) * 100 
      : 0;

    // Conversion Rate (simplified - orders per customer)
    const totalOrders = await Order.countDocuments({ createdAt: { $gte: currentMonth } });
    const conversionRate = totalCustomers > 0 ? (totalOrders / totalCustomers) * 100 : 0;

    // Inventory Health
    const totalProducts = await Product.countDocuments();
    const lowStockProducts = await Product.countDocuments({ stock: { $lt: 10 } });
    const outOfStockProducts = await Product.countDocuments({ stock: { $eq: 0 } });
    
    const inventoryHealth = totalProducts > 0 
      ? ((totalProducts - lowStockProducts - outOfStockProducts) / totalProducts) * 100 
      : 0;

    const metrics = {
      averageOrderValue: Math.round(averageOrderValue),
      customerRetentionRate: Math.round(customerRetentionRate * 10) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
      inventoryHealth: Math.round(inventoryHealth * 10) / 10,
      totalCustomers,
      totalOrders,
      totalProducts,
      lowStockProducts: lowStockProducts + outOfStockProducts
    };

    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch performance metrics' });
  }
};

// Get Inventory Status
const getInventoryStatus = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    
    const inStockProducts = await Product.countDocuments({ stock: { $gt: 10 } });
    const lowStockProducts = await Product.countDocuments({ stock: { $gt: 0, $lte: 10 } });
    const outOfStockProducts = await Product.countDocuments({ stock: { $eq: 0 } });
    
    // Fast moving products (products with most orders in last 30 days)
    const fastMovingProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 1 }
    ]);

    const fastMovingCount = fastMovingProducts.length > 0 ? fastMovingProducts[0].totalQuantity : 0;

    const inventoryStatus = {
      inStock: {
        count: inStockProducts,
        percentage: totalProducts > 0 ? Math.round((inStockProducts / totalProducts) * 100) : 0
      },
      lowStock: {
        count: lowStockProducts,
        percentage: totalProducts > 0 ? Math.round((lowStockProducts / totalProducts) * 100) : 0
      },
      outOfStock: {
        count: outOfStockProducts,
        percentage: totalProducts > 0 ? Math.round((outOfStockProducts / totalProducts) * 100) : 0
      },
      fastMoving: {
        count: fastMovingCount,
        description: 'High demand items'
      }
    };

    res.json({ success: true, data: inventoryStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch inventory status' });
  }
};

// Get Active Users Data (Daily-wise with rolling window)
const getActiveUsersData = async (req, res) => {
  try {
    const { period = '30days', startDate: startDateParam, endDate: endDateParam, page = 1, limit = 10 } = req.query;
    
    // Get active days setting from database
    const Settings = (await import('../../models/settings.js')).default;
    const settings = await Settings.getSettings();
    const activeDays = settings?.activeUserSettings?.activeDays || 15;
    const weeklyActiveDays = settings?.activeUserSettings?.weeklyActiveDays || 7;
    const monthlyActiveDays = settings?.activeUserSettings?.monthlyActiveDays || 30;
    
    // Calculate date range based on period or custom dates
    let startDate, endDate;
    if (startDateParam && endDateParam) {
      // Custom date range
      startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Use period
      let daysToFetch = 30;
      if (period === '7days') daysToFetch = 7;
      else if (period === '30days') daysToFetch = 30;
      else if (period === '90days') daysToFetch = 90;
      
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date();
      startDate.setDate(startDate.getDate() - daysToFetch);
      startDate.setHours(0, 0, 0, 0);
    }
    
    // Get daily order counts (for chart visualization)
    const dailyOrderUsers = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            user: "$user"
          }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          usersOrdered: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Calculate rolling active users for each day (using dynamic activeDays setting)
    const dateRange = eachDayOfInterval({
      start: startDate,
      end: endDate
    });
    
    const rollingActiveUsers = await Promise.all(
      dateRange.map(async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        // X days before this date (based on settings)
        const daysBefore = new Date(date);
        daysBefore.setDate(daysBefore.getDate() - activeDays);
        
        // Count unique users who ordered in last X days from this date
        const activeUsers = await Order.distinct('user', {
          createdAt: {
            $gte: daysBefore,
            $lte: date
          }
        });
        
        return {
          date: dateStr,
          activeUsersCount: activeUsers.length
        };
      })
    );
    
    // Get daily new user registrations
    const newUsersByDay = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          newUsers: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Merge data for all dates
    const usersData = dateRange.map((date, index) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const ordersData = dailyOrderUsers.find(d => d._id === dateStr);
      const newData = newUsersByDay.find(d => d._id === dateStr);
      const rollingData = rollingActiveUsers[index];
      
      return {
        date: dateStr,
        activeUsers: rollingData?.activeUsersCount || 0, // 15-day rolling active users
        usersOrdered: ordersData?.usersOrdered || 0,     // Users who ordered on this day
        newUsers: newData?.newUsers || 0
      };
    });
    
    // Calculate summary stats using dynamic settings
    const totalUsers = await User.countDocuments();
    
    // Active users based on primary activeDays setting (within the date range)
    const activeDaysAgo = new Date(endDate);
    activeDaysAgo.setDate(activeDaysAgo.getDate() - activeDays);
    const activeUsersMain = await Order.distinct('user', {
      createdAt: { 
        $gte: activeDaysAgo > startDate ? activeDaysAgo : startDate,
        $lte: endDate
      }
    });
    
    // Active users this month (within the date range)
    const monthStart = startOfMonth(endDate);
    const activeThisMonth = await Order.distinct('user', {
      createdAt: { 
        $gte: monthStart > startDate ? monthStart : startDate,
        $lte: endDate
      }
    });
    
    // Active users based on weeklyActiveDays setting (within the date range)
    const weeklyDaysAgo = new Date(endDate);
    weeklyDaysAgo.setDate(weeklyDaysAgo.getDate() - weeklyActiveDays);
    const activeUsersWeekly = await Order.distinct('user', {
      createdAt: { 
        $gte: weeklyDaysAgo > startDate ? weeklyDaysAgo : startDate,
        $lte: endDate
      }
    });

    // Get total count of active users for pagination
    const totalActiveUsers = await User.aggregate([
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$user', '$$userId'] },
                createdAt: {
                  $gte: activeDaysAgo > startDate ? activeDaysAgo : startDate,
                  $lte: endDate
                }
              }
            }
          ],
          as: 'orders'
        }
      },
      {
        $match: {
          orders: { $ne: [] }
        }
      },
      {
        $count: 'total'
      }
    ]);

    const totalCount = totalActiveUsers[0]?.total || 0;

    // Get active users list with details (with pagination)
    const activeUsersList = await User.aggregate([
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$user', '$$userId'] },
                createdAt: {
                  $gte: activeDaysAgo > startDate ? activeDaysAgo : startDate,
                  $lte: endDate
                }
              }
            }
          ],
          as: 'orders'
        }
      },
      {
        $match: {
          orders: { $ne: [] }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phone: 1,
          isGuest: 1,
          totalOrders: { $size: '$orders' },
          lastOrderDate: { $max: '$orders.createdAt' }
        }
      },
      {
        $sort: { lastOrderDate: -1 }
      },
      {
        $skip: (parseInt(page) - 1) * parseInt(limit)
      },
      {
        $limit: parseInt(limit)
      }
    ]);
    
    const summary = {
      totalUsers,
      activeLast15Days: activeUsersMain.length,       // Using dynamic activeDays setting
      activeLast7Days: activeUsersWeekly.length,      // Using dynamic weeklyActiveDays setting
      activeThisMonth: activeThisMonth.length,         // Monthly active users
      totalNewUsers: newUsersByDay.reduce((sum, d) => sum + d.newUsers, 0),
      averageDailyOrders: Math.round(
        usersData.reduce((sum, d) => sum + d.usersOrdered, 0) / usersData.length
      ),
      currentActiveUsers: rollingActiveUsers[rollingActiveUsers.length - 1]?.activeUsersCount || 0,
      activeDaysSetting: activeDays,                   // Include the setting value for frontend reference
      weeklyActiveDaysSetting: weeklyActiveDays
    };
    
    res.json({ 
      success: true, 
      data: {
        users: usersData,
        summary,
        activeUsersList: activeUsersList.map(user => ({
          _id: user._id.toString(),
          name: user.name || null,
          email: user.email,
          phone: user.phone || null,
          isGuest: user.isGuest || false,
          totalOrders: user.totalOrders || 0,
          lastOrderDate: user.lastOrderDate || null
        })),
        totalActiveUsers: totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch active users data' });
  }
};

export {
  getDashboardStats,
  getRecentOrders,
  getTopProducts,
  getSalesChartData,
  getPerformanceMetrics,
  getInventoryStatus,
  getActiveUsersData
};
