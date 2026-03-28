import User from '../../models/user.js';
import RewardPoints from '../../models/rewardPoints.js';

// Get user's referral code
export const getUserReferralCode = async (req, res) => {
  try {
  
    
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in token'
      });
    }
    
    console.log('Using user ID:', userId);
    
    const user = await User.findById(userId).select('referralCode name');
    console.log('Found user:', user);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('User referral code:', user.referralCode);
    console.log('User name:', user.name);

    res.json({
      success: true,
      message: 'Referral code retrieved successfully',
      data: {
        referralCode: user.referralCode,
        userName: user.name
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Validate referral code during signup
export const validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message: 'Referral code is required'
      });
    }

    // Find user with this referral code
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    
    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }

    res.json({
      success: true,
      message: 'Referral code is valid',
      data: {
        referrerName: referrer.name,
        referralCode: referrer.referralCode
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Award referral points for first order
export const awardReferralPoints = async (req, res) => {
  try {
    const { userId, orderId, orderAmount } = req.body;

    if (!userId || !orderId || !orderAmount) {
      return res.status(400).json({
        success: false,
        message: 'User ID, order ID, and order amount are required'
      });
    }

    // Find user and check if they were referred
    const user = await User.findById(userId).populate('referredBy', 'name referralCode');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user was referred and hasn't used referral code yet
    if (!user.referredBy || user.referralCodeUsed) {
      return res.status(400).json({
        success: false,
        message: 'User is not eligible for referral points'
      });
    }

    // Award 200 points to the referred user
    let rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
    
    if (!rewardPoints) {
      rewardPoints = new RewardPoints({
        user: userId,
        entries: [],
        totalEarned: 0,
        totalRedeemed: 0,
        isActive: true
      });
    }

    // Create referral points entry
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 6);

    const referralEntry = {
      orderId: orderId,
      points: 200, // Fixed 200 points for referral
      orderAmount: orderAmount,
      expiryDate: expiryDate,
      isActive: true,
      isReferralPoints: true // Flag to identify referral points
    };

    rewardPoints.entries.push(referralEntry);
    rewardPoints.totalEarned += 200;
    await rewardPoints.save();

    // Mark referral code as used
    user.referralCodeUsed = true;
    await user.save();

    console.log(`Awarded 200 referral points to user ${userId} for order ${orderId} (referred by ${user.referredBy.name})`);

    res.json({
      success: true,
      message: 'Referral points awarded successfully',
      data: {
        pointsAwarded: 200,
        referrerName: user.referredBy.name,
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

// Get referral statistics
export const getReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Count users referred by this user
    const referredUsers = await User.countDocuments({ referredBy: userId });
    
    // Count users who have used referral code (completed first order)
    const activeReferrals = await User.countDocuments({ 
      referredBy: userId, 
      referralCodeUsed: true 
    });

    res.json({
      success: true,
      message: 'Referral statistics retrieved successfully',
      data: {
        totalReferred: referredUsers,
        activeReferrals: activeReferrals,
        potentialEarnings: activeReferrals * 200 // 200 points per successful referral
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
