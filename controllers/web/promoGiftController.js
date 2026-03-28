import Promo from '../../models/promo.js';
import GiftVoucher from '../../models/giftVoucher.js';

// Get all active promo codes (public endpoint - no auth required)
export const getActivePromoCodes = async (req, res) => {
  try {
    const now = new Date();
    
    const promos = await Promo.find({
      isActive: true,
      $or: [
        { validUntil: { $gte: now } },
        { validUntil: null }
      ],
      $or: [
        { validFrom: { $lte: now } },
        { validFrom: null }
      ]
    })
    .select('code name description type value minimumAmount maximumDiscount validFrom validUntil image priority')
    .sort({ priority: -1, createdAt: -1 })
    .limit(50);

    // Filter out promos that have reached usage limit
    const validPromos = promos.filter(promo => {
      if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
        return false;
      }
      return true;
    });

    res.json({
      success: true,
      message: 'Active promo codes fetched successfully',
      data: validPromos
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch promo codes',
      error: error.message
    });
  }
};

// Get all active gift vouchers (public endpoint - no auth required)
export const getActiveGiftVouchers = async (req, res) => {
  try {
    const now = new Date();
    
    const giftVouchers = await GiftVoucher.find({
      isActive: true,
      $or: [
        { validUntil: { $gte: now } },
        { validUntil: null }
      ],
      $or: [
        { validFrom: { $lte: now } },
        { validFrom: null }
      ]
    })
    .select('code name description type value minimumAmount maximumDiscount validFrom validUntil image')
    .sort({ createdAt: -1 })
    .limit(50);

    // Filter out gift vouchers that have reached usage limit
    const validGiftVouchers = giftVouchers.filter(giftVoucher => {
      if (giftVoucher.usageLimit && giftVoucher.usedCount >= giftVoucher.usageLimit) {
        return false;
      }
      return true;
    });

    res.json({
      success: true,
      message: 'Active gift vouchers fetched successfully',
      data: validGiftVouchers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gift vouchers',
      error: error.message
    });
  }
};

// Get digital wallets (static data for now, can be moved to database later)
export const getDigitalWallets = async (req, res) => {
  try {
    const wallets = [
      {
        id: 'paytm',
        name: 'Paytm',
        icon: 'paytm',
        description: 'Pay using Paytm wallet',
        isActive: true
      },
      {
        id: 'phonepe',
        name: 'PhonePe',
        icon: 'phonepe',
        description: 'Pay using PhonePe wallet',
        isActive: true
      },
      {
        id: 'googlepay',
        name: 'Google Pay',
        icon: 'googlepay',
        description: 'Pay using Google Pay',
        isActive: true
      },
      {
        id: 'amazonpay',
        name: 'Amazon Pay',
        icon: 'amazonpay',
        description: 'Pay using Amazon Pay wallet',
        isActive: true
      },
      {
        id: 'freecharge',
        name: 'Freecharge',
        icon: 'freecharge',
        description: 'Pay using Freecharge wallet',
        isActive: true
      },
      {
        id: 'mobikwik',
        name: 'MobiKwik',
        icon: 'mobikwik',
        description: 'Pay using MobiKwik wallet',
        isActive: true
      }
    ];

    res.json({
      success: true,
      message: 'Digital wallets fetched successfully',
      data: wallets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch digital wallets',
      error: error.message
    });
  }
};

// Get bank offers (static data for now, can be moved to database later)
export const getBankOffers = async (req, res) => {
  try {
    const { amount } = req.query;
    const cartAmount = amount ? parseFloat(amount) : 0;

    const bankOffers = [
      {
        id: 'hdfc_credit_offer',
        bank: 'HDFC Bank',
        offer: 'HDFC Credit Card',
        discount: 10,
        discountType: 'percentage',
        minAmount: 2000,
        maxDiscount: 1000,
        description: '10% instant discount on HDFC Credit Cards (Min. ₹2000)',
        isActive: true,
        validUntil: null
      },
      {
        id: 'icici_credit_offer',
        bank: 'ICICI Bank',
        offer: 'ICICI Credit Card',
        discount: 8,
        discountType: 'percentage',
        minAmount: 1500,
        maxDiscount: 800,
        description: '8% instant discount on ICICI Credit Cards (Min. ₹1500)',
        isActive: true,
        validUntil: null
      },
      {
        id: 'sbi_credit_offer',
        bank: 'State Bank of India',
        offer: 'SBI Credit Card',
        discount: 7,
        discountType: 'percentage',
        minAmount: 2000,
        maxDiscount: 700,
        description: '7% instant discount on SBI Credit Cards (Min. ₹2000)',
        isActive: true,
        validUntil: null
      },
      {
        id: 'axis_credit_offer',
        bank: 'Axis Bank',
        offer: 'Axis Credit Card',
        discount: 6,
        discountType: 'percentage',
        minAmount: 1500,
        maxDiscount: 600,
        description: '6% instant discount on Axis Credit Cards (Min. ₹1500)',
        isActive: true,
        validUntil: null
      }
    ];

    // Filter offers based on cart amount
    const applicableOffers = bankOffers.filter(offer => {
      if (!offer.isActive) return false;
      if (offer.validUntil && new Date() > new Date(offer.validUntil)) return false;
      if (cartAmount > 0 && cartAmount < offer.minAmount) return false;
      return true;
    });

    res.json({
      success: true,
      message: 'Bank offers fetched successfully',
      data: applicableOffers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bank offers',
      error: error.message
    });
  }
};

