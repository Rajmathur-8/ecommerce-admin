import mongoose from 'mongoose';
import User from '../models/user.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))

// Generate unique referral code
async function generateUniqueReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code already exists
    const existingUser = await User.findOne({ referralCode: code });
    if (!existingUser) {
      isUnique = true;
    }
  }
  
  return code;
}

// Generate referral codes for users who don't have one
async function generateReferralCodesForExistingUsers() {
  try {
    console.log('Checking for users without referral codes...');
    
    // Find users without referral codes
    const usersWithoutCodes = await User.find({ 
      $or: [
        { referralCode: { $exists: false } },
        { referralCode: null },
        { referralCode: '' }
      ]
    });
    
    console.log(`Found ${usersWithoutCodes.length} users without referral codes`);
    
    if (usersWithoutCodes.length === 0) {
      console.log('All users already have referral codes!');
      return;
    }
    
    // Generate referral codes for each user
    for (const user of usersWithoutCodes) {
      const referralCode = await generateUniqueReferralCode();
      user.referralCode = referralCode;
      await user.save();
      console.log(`Generated referral code ${referralCode} for user ${user.email}`);
    }
    
    console.log('Successfully generated referral codes for all users!');
    
  } catch (error) {
  }
}

// Run the script
generateReferralCodesForExistingUsers()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    process.exit(1);
  });
