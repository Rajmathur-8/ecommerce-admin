import User from '../../models/user.js';
import bcrypt from 'bcryptjs';

// Get user profile
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('-password -otp -otpExpires -resetToken -resetTokenExpires');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: { user }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    // Debug: Log the request data
    console.log('updateUserProfile - Request body:', req.body);
    console.log('updateUserProfile - User ID:', userId);

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Debug: Log current user data
    console.log('updateUserProfile - Current user data:', {
      id: user._id,
      name: user.name,
      phone: user.phone
    });

    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;

    // Debug: Log update data
    console.log('updateUserProfile - Update data:', updateData);

    // Use updateOne to avoid validation issues with required fields
    await User.updateOne({ _id: userId }, { $set: updateData });

    // Return user without sensitive data
    const userResponse = await User.findById(userId).select('-password -otp -otpExpires -resetToken -resetTokenExpires');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: userResponse }
    });

  } catch (error) {
    console.log({
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has a password (not guest user)
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Password change not available for guest users'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedNewPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete user account
export const deleteUserAccount = async (req, res) => {
  try {
    console.log('=== DELETE ACCOUNT DEBUG ===');
    console.log('User from token:', req.user);
    console.log('User ID from token:', req.user?.id);
    console.log('User _id from token:', req.user?._id);
    console.log('Request body:', req.body);
    
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in token'
      });
    }
    
    console.log('Using user ID:', userId);
    const { password } = req.body;

    const user = await User.findById(userId);
    console.log('Found user:', user ? 'Yes' : 'No');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('User has password:', !!user.password);
    console.log('Password provided in request:', !!password);

    // Verify password if user has one
    if (user.password) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'Password is required to delete account'
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      console.log('Password validation result:', isPasswordValid);
      
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Password is incorrect'
        });
      }
    }

    console.log('Deleting user account...');
    // Delete user
    await User.findByIdAndDelete(userId);
    console.log('User account deleted successfully');

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get user statistics
export const getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Import required models
    const Order = (await import('../../models/order.js')).default;
    const Address = (await import('../../models/address.js')).default;
    const Rating = (await import('../../models/rating.js')).default;
    const RewardPoints = (await import('../../models/rewardPoints.js')).default;

    // Get counts
    const [orderCount, addressCount, reviewCount, rewardPoints] = await Promise.all([
      Order.countDocuments({ user: userId }),
      Address.countDocuments({ user: userId }),
      Rating.countDocuments({ user: userId }),
      RewardPoints.findOne({ user: userId, isActive: true })
    ]);

    const stats = {
      totalOrders: orderCount,
      totalAddresses: addressCount,
      totalReviews: reviewCount,
      rewardPoints: rewardPoints ? {
        currentPoints: rewardPoints.entries?.filter(entry => entry.isActive && new Date() < entry.expiryDate).reduce((sum, entry) => sum + entry.points, 0) || 0,
        totalEarned: rewardPoints.totalEarned || 0,
        totalRedeemed: rewardPoints.totalRedeemed || 0
      } : {
        currentPoints: 0,
        totalEarned: 0,
        totalRedeemed: 0
      }
    };

    res.json({
      success: true,
      message: 'User statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
