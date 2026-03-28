import seedPaymentMethods from './paymentMethods.js';

export const seed = {
  admins: [
    {
      email: "superadmin@gmail.com",
      password: "admin",
    },
  ]
}

export const runSeed = async () => {
  try {
    console.log('🌱 Starting seed process...');
    
    // Seed payment methods first (required for Razorpay)
    await seedPaymentMethods();
    
    console.log('✅ All seed data created successfully!');
  } catch (error) {
  }
};