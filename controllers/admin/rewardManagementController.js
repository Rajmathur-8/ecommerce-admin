import RewardPoints from '../../models/rewardPoints.js';
import User from '../../models/user.js';
import Order from '../../models/order.js';

// Get Reward Management Analytics
export const getRewardManagementAnalytics = async (req, res) => {
  try {
    // 1. Get all users with reward points
    const allRewardPoints = await RewardPoints.find({ isActive: true })
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    const now = new Date();

    // 2. User-wise reward details
    const userRewardDetails = allRewardPoints.map(reward => {
      const activeEntries = reward.entries.filter(
        entry => entry.isActive && entry.expiryDate > now
      );
      const expiredEntries = reward.entries.filter(
        entry => entry.isActive && entry.expiryDate <= now
      );
      const redeemedEntries = reward.entries.filter(
        entry => !entry.isActive
      );

      const currentActivePoints = activeEntries.reduce(
        (sum, entry) => sum + entry.points, 0
      );
      const expiredPoints = expiredEntries.reduce(
        (sum, entry) => sum + entry.points, 0
      );
      const redeemedPoints = redeemedEntries.reduce(
        (sum, entry) => sum + entry.points, 0
      );

      // Find earliest expiry date
      const earliestExpiry = activeEntries.length > 0
        ? new Date(Math.min(...activeEntries.map(e => e.expiryDate.getTime())))
        : null;

      return {
        userId: reward.user._id,
        userName: reward.user?.name || 'Unknown',
        userEmail: reward.user?.email || 'N/A',
        userPhone: reward.user?.phone || 'N/A',
        totalEarned: reward.totalEarned,
        totalRedeemed: reward.totalRedeemed,
        currentActivePoints,
        expiredPoints,
        redeemedPoints,
        totalEntries: reward.entries.length,
        activeEntriesCount: activeEntries.length,
        expiredEntriesCount: expiredEntries.length,
        redeemedEntriesCount: redeemedEntries.length,
        earliestExpiry,
        lastEarned: reward.entries.length > 0
          ? reward.entries[reward.entries.length - 1].orderId
          : null,
        entries: reward.entries.map(entry => ({
          orderId: entry.orderId,
          points: entry.points,
          orderAmount: entry.orderAmount,
          expiryDate: entry.expiryDate,
          isActive: entry.isActive && entry.expiryDate > now,
          isExpired: entry.isActive && entry.expiryDate <= now,
          isRedeemed: !entry.isActive
        }))
      };
    });

    // 3. Summary Statistics
    const totalUsersWithRewards = allRewardPoints.length;
    const totalPointsEarned = allRewardPoints.reduce(
      (sum, r) => sum + r.totalEarned, 0
    );
    const totalPointsRedeemed = allRewardPoints.reduce(
      (sum, r) => sum + r.totalRedeemed, 0
    );

    let totalActivePoints = 0;
    let totalExpiredPoints = 0;
    let totalRedeemedPoints = 0;

    allRewardPoints.forEach(reward => {
      reward.entries.forEach(entry => {
        if (entry.isActive && entry.expiryDate > now) {
          totalActivePoints += entry.points;
        } else if (entry.isActive && entry.expiryDate <= now) {
          totalExpiredPoints += entry.points;
        } else if (!entry.isActive) {
          totalRedeemedPoints += entry.points;
        }
      });
    });

    // 4. Expired Points Details
    const expiredPointsDetails = [];
    allRewardPoints.forEach(reward => {
      reward.entries.forEach(entry => {
        if (entry.isActive && entry.expiryDate <= now) {
          expiredPointsDetails.push({
            userId: reward.user._id,
            userName: reward.user?.name || 'Unknown',
            userEmail: reward.user?.email || 'N/A',
            orderId: entry.orderId,
            points: entry.points,
            orderAmount: entry.orderAmount,
            expiryDate: entry.expiryDate,
            daysExpired: Math.floor((now - entry.expiryDate) / (1000 * 60 * 60 * 24))
          });
        }
      });
    });

    // 5. Points Expiring Soon (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringSoonDetails = [];
    allRewardPoints.forEach(reward => {
      reward.entries.forEach(entry => {
        if (
          entry.isActive &&
          entry.expiryDate > now &&
          entry.expiryDate <= thirtyDaysFromNow
        ) {
          expiringSoonDetails.push({
            userId: reward.user._id,
            userName: reward.user?.name || 'Unknown',
            userEmail: reward.user?.email || 'N/A',
            orderId: entry.orderId,
            points: entry.points,
            orderAmount: entry.orderAmount,
            expiryDate: entry.expiryDate,
            daysUntilExpiry: Math.ceil((entry.expiryDate - now) / (1000 * 60 * 60 * 24))
          });
        }
      });
    });

    // 6. Top Users by Points
    const topUsersByPoints = userRewardDetails
      .sort((a, b) => b.currentActivePoints - a.currentActivePoints)
      .slice(0, 10);

    // 7. Recent Reward Activities
    const recentActivities = [];
    allRewardPoints.forEach(reward => {
      reward.entries.forEach(entry => {
        recentActivities.push({
          userId: reward.user._id,
          userName: reward.user?.name || 'Unknown',
          userEmail: reward.user?.email || 'N/A',
          orderId: entry.orderId,
          points: entry.points,
          orderAmount: entry.orderAmount,
          expiryDate: entry.expiryDate,
          status: entry.isActive
            ? (entry.expiryDate > now ? 'active' : 'expired')
            : 'redeemed',
          createdAt: reward.createdAt
        });
      });
    });

    recentActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      data: {
        summary: {
          totalUsersWithRewards,
          totalPointsEarned,
          totalPointsRedeemed,
          totalActivePoints,
          totalExpiredPoints,
          totalRedeemedPoints,
          averagePointsPerUser: totalUsersWithRewards > 0
            ? Math.round(totalActivePoints / totalUsersWithRewards)
            : 0
        },
        userRewardDetails,
        expiredPointsDetails: expiredPointsDetails.slice(0, 100), // Limit for performance
        expiringSoonDetails: expiringSoonDetails.slice(0, 100),
        topUsersByPoints,
        recentActivities: recentActivities.slice(0, 50)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reward management analytics',
      error: error.message
    });
  }
};

// Get specific user's reward details
export const getUserRewardDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const rewardPoints = await RewardPoints.findOne({
      user: userId,
      isActive: true
    }).populate('user', 'name email phone');

    if (!rewardPoints) {
      return res.status(404).json({
        success: false,
        message: 'Reward points not found for this user'
      });
    }

    const now = new Date();
    const activeEntries = rewardPoints.entries.filter(
      entry => entry.isActive && entry.expiryDate > now
    );
    const expiredEntries = rewardPoints.entries.filter(
      entry => entry.isActive && entry.expiryDate <= now
    );
    const redeemedEntries = rewardPoints.entries.filter(
      entry => !entry.isActive
    );

    // Get order details for entries
    const orderIds = rewardPoints.entries.map(e => e.orderId);
    const orders = await Order.find({ _id: { $in: orderIds } })
      .select('orderNumber createdAt total');

    const orderMap = {};
    orders.forEach(order => {
      orderMap[order._id.toString()] = order;
    });

    const detailedEntries = rewardPoints.entries.map(entry => {
      const order = orderMap[entry.orderId.toString()];
      return {
        orderId: entry.orderId,
        orderNumber: order?.orderNumber || 'N/A',
        orderDate: order?.createdAt || null,
        orderAmount: entry.orderAmount,
        points: entry.points,
        expiryDate: entry.expiryDate,
        status: entry.isActive
          ? (entry.expiryDate > now ? 'active' : 'expired')
          : 'redeemed',
        daysUntilExpiry: entry.isActive && entry.expiryDate > now
          ? Math.ceil((entry.expiryDate - now) / (1000 * 60 * 60 * 24))
          : null,
        daysExpired: entry.isActive && entry.expiryDate <= now
          ? Math.floor((now - entry.expiryDate) / (1000 * 60 * 60 * 24))
          : null
      };
    });

    res.json({
      success: true,
      data: {
        user: {
          id: rewardPoints.user._id,
          name: rewardPoints.user?.name || 'Unknown',
          email: rewardPoints.user?.email || 'N/A',
          phone: rewardPoints.user?.phone || 'N/A'
        },
        summary: {
          totalEarned: rewardPoints.totalEarned,
          totalRedeemed: rewardPoints.totalRedeemed,
          currentActivePoints: activeEntries.reduce((sum, e) => sum + e.points, 0),
          expiredPoints: expiredEntries.reduce((sum, e) => sum + e.points, 0),
          redeemedPoints: redeemedEntries.reduce((sum, e) => sum + e.points, 0),
          activeEntriesCount: activeEntries.length,
          expiredEntriesCount: expiredEntries.length,
          redeemedEntriesCount: redeemedEntries.length
        },
        entries: detailedEntries.sort((a, b) => {
          // Sort by expiry date (active first, then expired, then redeemed)
          if (a.status === 'active' && b.status !== 'active') return -1;
          if (a.status !== 'active' && b.status === 'active') return 1;
          return new Date(b.expiryDate) - new Date(a.expiryDate);
        })
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user reward details',
      error: error.message
    });
  }
};

export default {
  getRewardManagementAnalytics,
  getUserRewardDetails
};

