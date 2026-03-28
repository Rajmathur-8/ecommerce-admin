import PaymentMethod from '../models/paymentMethod.js';

const paymentMethods = [
  {
    name: 'Razorpay',
    displayName: 'Credit/Debit Card',
    description: 'Pay securely with credit cards, debit cards',
    icon: 'credit-card',
    isActive: true,
    isPopular: true,
    order: 1,
    config: {
      // Razorpay credentials will be configured via admin panel
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
      razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
      minAmount: 1,
      maxAmount: 1000000,
      processingFee: 0,
      processingFeeType: 'fixed'
    },
    restrictions: {
      minOrderValue: 1,
      maxOrderValue: 1000000
    }
  },
  {
    name: 'Cash on Delivery',
    displayName: 'Cash on Delivery',
    description: 'Pay with cash when you receive your order',
    icon: 'truck',
    isActive: true,
    isPopular: false,
    order: 2,
    config: {
      codCharges: 0,
      codMinAmount: 0,
      codMaxAmount: 10000,
      minAmount: 0,
      maxAmount: 10000,
      processingFee: 0,
      processingFeeType: 'fixed'
    },
    restrictions: {
      minOrderValue: 0,
      maxOrderValue: 10000
    }
  },
  {
    name: 'UPI',
    displayName: 'UPI Payment',
    description: 'Pay using UPI apps like Google Pay, PhonePe, Paytm',
    icon: 'smartphone',
    isActive: true,
    isPopular: true,
    order: 3,
    config: {
      minAmount: 1,
      maxAmount: 100000,
      processingFee: 0,
      processingFeeType: 'fixed'
    },
    restrictions: {
      minOrderValue: 1,
      maxOrderValue: 100000
    }
  },
  {
    name: 'Wallet',
    displayName: 'Digital Wallet',
    description: 'Pay using digital wallets like Paytm, PhonePe, Google Pay',
    icon: 'wallet',
    isActive: true,
    isPopular: false,
    order: 4,
    config: {
      minAmount: 1,
      maxAmount: 50000,
      processingFee: 0,
      processingFeeType: 'fixed'
    },
    restrictions: {
      minOrderValue: 1,
      maxOrderValue: 50000
    }
  }
];

export const seedPaymentMethods = async () => {
  try {
    console.log('🌱 Seeding payment methods...');
    
    for (const method of paymentMethods) {
      const existingMethod = await PaymentMethod.findOne({ name: method.name });
      
      if (!existingMethod) {
        await PaymentMethod.create(method);
        console.log(`✅ Created payment method: ${method.displayName}`);
      } else {
        // Update existing method to ensure it has proper config
        if (method.name === 'Razorpay' && !existingMethod.config?.razorpayKeyId) {
          existingMethod.config = {
            ...existingMethod.config,
            ...method.config
          };
          await existingMethod.save();
          console.log(`✅ Updated Razorpay configuration: ${method.displayName}`);
        } else {
          console.log(`⏭️  Payment method already exists: ${method.displayName}`);
        }
      }
    }
    
    console.log('✅ Payment methods seeding completed!');
  } catch (error) {
  }
};

export default seedPaymentMethods;
