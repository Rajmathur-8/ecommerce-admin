import { connectDB } from '../db/mongo-db-connect.js';
import AdminModel from '../models/admin.js';
import PaymentMethod from '../models/paymentMethod.js';

export const clearSeededData = async () => {
  try {
    console.log('🗑️  Starting to clear seeded data...');
    
    // Clear admin user (superadmin)
    const adminResult = await AdminModel.deleteOne({ email: "superadmin@gmail.com" });
    if (adminResult.deletedCount > 0) {
      console.log('✅ Removed superadmin user');
    } else {
      console.log('⏭️  No superadmin user found to remove');
    }
    
    // Clear all payment methods
    const paymentMethods = ['Razorpay', 'Cash on Delivery', 'UPI', 'Wallet'];
    for (const method of paymentMethods) {
      const result = await PaymentMethod.deleteOne({ name: method });
      if (result.deletedCount > 0) {
        console.log(`✅ Removed payment method: ${method}`);
      } else {
        console.log(`⏭️  No payment method found: ${method}`);
      }
    }
    
    console.log('✅ All seeded data cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing seeded data:', error.message);
    throw error;
  }
};

// Run if called directly
const args = process.argv.slice(2);
if (args[0] === 'clear') {
  connectDB().then(async () => {
    await clearSeededData();
    process.exit(0);
  }).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
}

export default clearSeededData;
