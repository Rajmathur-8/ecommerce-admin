import RewardPoints from '../../models/rewardPoints.js';
import User from '../../models/user.js';
import Order from '../../models/order.js';

// Get user's reward points
export const getUserRewardPoints = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // First, try to find reward points by current user ID
    let rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
    
    // If not found and user has email, try to find reward points from other user accounts with same email
    // This handles the case where guest users might have different user IDs across sessions
    if (!rewardPoints && userEmail) {
      console.log(`No reward points found for user ID ${userId}, checking by email ${userEmail}`);
      
      // Find all users with the same email
      const usersWithSameEmail = await User.find({ email: userEmail }).select('_id');
      const userIds = usersWithSameEmail.map(u => u._id);
      
      if (userIds.length > 0) {
        // Find reward points for any of these user IDs
        const allRewardPoints = await RewardPoints.find({ 
          user: { $in: userIds }, 
          isActive: true 
        });
        
        if (allRewardPoints.length > 0) {
          // Merge all reward points into the current user's record
          console.log(`Found ${allRewardPoints.length} reward point records for email ${userEmail}, merging...`);
          
          // Create or get current user's reward points record
          rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
          
          if (!rewardPoints) {
            rewardPoints = new RewardPoints({
              user: userId,
              entries: [],
              totalEarned: 0,
              totalRedeemed: 0,
              isActive: true
            });
          }
          
          // Merge entries from all reward point records
          let mergedTotalRedeemed = rewardPoints.totalRedeemed;
          
          for (const rp of allRewardPoints) {
            // Add entries that don't already exist (check by orderId)
            const existingOrderIds = new Set(rewardPoints.entries.map(e => e.orderId.toString()));
            rp.entries.forEach(entry => {
              if (!existingOrderIds.has(entry.orderId.toString())) {
                rewardPoints.entries.push(entry);
              }
            });
            mergedTotalRedeemed += rp.totalRedeemed;
          }
          
          // Recalculate totalEarned from all entries to avoid double-counting
          rewardPoints.totalEarned = rewardPoints.entries.reduce((total, entry) => total + entry.points, 0);
          rewardPoints.totalRedeemed = mergedTotalRedeemed;
          await rewardPoints.save();
          
          console.log(`Merged reward points: ${rewardPoints.totalEarned} earned, ${mergedTotalRedeemed} redeemed`);
        }
      }
    }
    
    // Ensure reward points record exists
    if (!rewardPoints) {
      rewardPoints = new RewardPoints({
        user: userId,
        entries: [],
        totalEarned: 0,
        totalRedeemed: 0,
        isActive: true
      });
      await rewardPoints.save();
    }
    
    // Check for delivered orders that haven't been awarded points yet
    // This handles cases where orders were delivered before reward points were implemented or if points weren't awarded
    const hasNoEntries = !rewardPoints.entries || rewardPoints.entries.length === 0;
    if (hasNoEntries) {
      console.log(`🔍 No reward points entries found for user ${userId} (email: ${userEmail}), checking for delivered orders...`);
      
      // Find all users with the same email
      const usersWithSameEmail = userEmail ? await User.find({ email: userEmail }).select('_id') : [];
      const allUserIds = userEmail ? [userId, ...usersWithSameEmail.map(u => u._id)] : [userId];
      
      console.log(`🔍 Checking delivered orders for user IDs:`, allUserIds.map(id => id.toString()));
      
      // Find all delivered orders for these users
      const deliveredOrders = await Order.find({
        user: { $in: allUserIds },
        orderStatus: 'delivered',
        total: { $gt: 0 } // Any order with total > 0
      }).populate('user', 'email name').sort({ deliveredAt: -1 });
      
      console.log(`🔍 Found ${deliveredOrders.length} delivered orders for user ${userId}`);
      
      if (deliveredOrders.length > 0) {
        // Get existing order IDs that already have reward points
        const existingOrderIds = new Set(
          (rewardPoints.entries || []).map(e => e.orderId?.toString()).filter(Boolean)
        );
        
        console.log(`🔍 Existing order IDs with points:`, Array.from(existingOrderIds));
        
        // Award points for orders that don't have reward points yet
        let newPointsAwarded = 0;
        for (const order of deliveredOrders) {
          const orderIdStr = order._id.toString();
          if (!existingOrderIds.has(orderIdStr)) {
            console.log(`🎁 Processing order ${orderIdStr} - Total: ₹${order.total}, User: ${order.user?._id}`);
            try {
              // Import helper function dynamically to avoid circular dependency
              const { awardRewardPointsForOrder } = await import('./orderController.js');
              const result = await awardRewardPointsForOrder(order);
              if (result.success) {
                newPointsAwarded += result.points || 0;
                console.log(`✅ Awarded ${result.points} reward points for order ${orderIdStr}`);
              } else {
                console.log(`⚠️ Failed to award points for order ${orderIdStr}: ${result.error}`);
              }
            } catch (error) {
              console.error(`❌ Error awarding points for order ${orderIdStr}:`, error);
            }
          } else {
            console.log(`⏭️ Skipping order ${orderIdStr} - points already awarded`);
          }
        }
        
        if (newPointsAwarded > 0) {
          // Reload reward points to get updated entries
          rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
          console.log(`✅ Total new points awarded: ${newPointsAwarded}, Reloaded reward points`);
        } else {
          console.log(`⚠️ No new points were awarded. Check if orders meet minimum requirements (₹100+ for 1 point)`);
        }
      } else {
        console.log(`⚠️ No delivered orders found for user ${userId} with total > 0`);
      }
    }

    // Clean up expired entries
    const now = new Date();
    let hasExpiredEntries = false;
    
    rewardPoints.entries.forEach(entry => {
      if (entry.isActive && entry.expiryDate <= now) {
        entry.isActive = false;
        hasExpiredEntries = true;
      }
    });

    if (hasExpiredEntries) {
      await rewardPoints.save();
    }

    // Calculate current active points
    const currentPoints = rewardPoints.entries
      .filter(entry => entry.isActive && entry.expiryDate > now)
      .reduce((total, entry) => total + entry.points, 0);

    // Find earliest expiry date among active entries
    const activeEntries = rewardPoints.entries.filter(entry => entry.isActive && entry.expiryDate > now);
    const earliestExpiry = activeEntries.length > 0 
      ? new Date(Math.min(...activeEntries.map(entry => entry.expiryDate.getTime())))
      : null;

    res.json({
      success: true,
      message: 'Reward points retrieved successfully',
      data: {
        points: currentPoints,
        totalEarned: rewardPoints.totalEarned,
        totalRedeemed: rewardPoints.totalRedeemed,
        expiryDate: earliestExpiry,
        isActive: rewardPoints.isActive,
        entries: rewardPoints.entries.filter(entry => entry.isActive)
      }
    });

  } catch (error) {
    console.error('Error fetching reward points:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Add reward points when order is delivered
export const addRewardPoints = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, orderAmount } = req.body;

    if (!orderId || !orderAmount) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and amount are required'
      });
    }

    // Calculate points (1% of order amount)
    const pointsToAdd = Math.floor(orderAmount * 0.01);

    let rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
    
    if (!rewardPoints) {
      // Create new reward points record
      rewardPoints = new RewardPoints({
        user: userId,
        entries: [],
        totalEarned: 0,
        totalRedeemed: 0,
        isActive: true
      });
    }

    // Create new entry for this order
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 6);

    const newEntry = {
      orderId: orderId,
      points: pointsToAdd,
      orderAmount: orderAmount,
      expiryDate: expiryDate,
      isActive: true
    };

    rewardPoints.entries.push(newEntry);
    rewardPoints.totalEarned += pointsToAdd;
    await rewardPoints.save();

    // Calculate current active points
    const now = new Date();
    const currentPoints = rewardPoints.entries
      .filter(entry => entry.isActive && entry.expiryDate > now)
      .reduce((total, entry) => total + entry.points, 0);

    res.json({
      success: true,
      message: `${pointsToAdd} reward points added successfully`,
      data: {
        pointsAdded: pointsToAdd,
        totalPoints: currentPoints,
        expiryDate: expiryDate
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Redeem reward points
export const redeemRewardPoints = async (req, res) => {
  try {
    const userId = req.user.id;
    const { pointsToRedeem } = req.body;

    if (!pointsToRedeem || pointsToRedeem <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid points to redeem are required'
      });
    }

    const rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
    
    if (!rewardPoints) {
      return res.status(404).json({
        success: false,
        message: 'No reward points found'
      });
    }

    // Get current active points
    const now = new Date();
    const activeEntries = rewardPoints.entries.filter(entry => entry.isActive && entry.expiryDate > now);
    const currentPoints = activeEntries.reduce((total, entry) => total + entry.points, 0);

    // Check if user has enough points
    if (currentPoints < pointsToRedeem) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient reward points'
      });
    }

    // Redeem points (FIFO - First In, First Out)
    let remainingToRedeem = pointsToRedeem;
    let redeemedFromEntries = [];

    for (let entry of activeEntries) {
      if (remainingToRedeem <= 0) break;
      
      const pointsFromThisEntry = Math.min(entry.points, remainingToRedeem);
      entry.points -= pointsFromThisEntry;
      remainingToRedeem -= pointsFromThisEntry;
      
      if (entry.points === 0) {
        entry.isActive = false;
      }
      
      redeemedFromEntries.push({
        orderId: entry.orderId,
        points: pointsFromThisEntry
      });
    }

    rewardPoints.totalRedeemed += pointsToRedeem;
    await rewardPoints.save();

    // Calculate remaining active points
    const remainingPoints = rewardPoints.entries
      .filter(entry => entry.isActive && entry.expiryDate > now)
      .reduce((total, entry) => total + entry.points, 0);

    res.json({
      success: true,
      message: `${pointsToRedeem} points redeemed successfully`,
      data: {
        pointsRedeemed: pointsToRedeem,
        remainingPoints: remainingPoints,
        discountAmount: pointsToRedeem, // 1 point = 1 rupee discount
        redeemedFromEntries: redeemedFromEntries
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get reward points history
export const getRewardPointsHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const rewardPoints = await RewardPoints.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    if (!rewardPoints) {
      return res.json({
        success: true,
        message: 'No reward points history found',
        data: {
          history: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          }
        }
      });
    }

    res.json({
      success: true,
      message: 'Reward points history retrieved successfully',
      data: {
        history: [rewardPoints],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 1,
          pages: 1
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
