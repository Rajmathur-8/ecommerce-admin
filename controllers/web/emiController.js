import PaymentMethod from '../../models/paymentMethod.js';
import Razorpay from 'razorpay';
import https from 'https';

// Get Razorpay instance from database configuration
const getRazorpayInstance = async () => {
  try {
    // Get Razorpay payment method config from database
    const razorpayMethod = await PaymentMethod.findOne({ 
      name: 'Razorpay', 
      isActive: true 
    });
    
    if (!razorpayMethod) {
      throw new Error('Razorpay payment method not found');
    }
    
    if (!razorpayMethod.config?.razorpayKeyId || !razorpayMethod.config?.razorpayKeySecret) {
      throw new Error('Razorpay credentials not configured');
    }
    
    // Create Razorpay instance with database credentials
    const razorpay = new Razorpay({
      key_id: razorpayMethod.config.razorpayKeyId,
      key_secret: razorpayMethod.config.razorpayKeySecret
    });
    
    return razorpay;
  } catch (error) {
    return null;
  }
};

// Razorpay EMI configuration
const RAZORPAY_EMI_CONFIG = {
  supportedTenures: [3, 6, 9, 12],
  minAmount: 3000,
  maxAmount: 1000000
};

// Calculate EMI amount using standard formula
const calculateEMI = (principal, rate, tenure) => {
  const monthlyRate = rate / (12 * 100);
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / 
              (Math.pow(1 + monthlyRate, tenure) - 1);
  return Math.round(emi);
};

// Generate EMI plans based on amount and card type
const generateEMIPlans = (amount, cardType = 'credit') => {
  const plans = [];
  const tenures = [3, 6, 9, 12];
  
  // Common banks with EMI options
  const banks = [
    { name: 'HDFC Bank', code: 'HDFC', interestRate: 12, processingFee: 0 },
    { name: 'ICICI Bank', code: 'ICICI', interestRate: 13, processingFee: 0 },
    { name: 'Axis Bank', code: 'AXIS', interestRate: 12.5, processingFee: 0 },
    { name: 'SBI Card', code: 'SBI', interestRate: 11.5, processingFee: 0 },
    { name: 'Kotak Mahindra', code: 'KOTAK', interestRate: 13.5, processingFee: 0 }
  ];

  banks.forEach((bank, index) => {
    tenures.forEach((tenure) => {
      const interestRate = bank.interestRate + (tenure > 6 ? 1 : 0); // Slightly higher for longer tenures
      const emiAmount = calculateEMI(amount, interestRate, tenure);
      const totalAmount = emiAmount * tenure;
      const interestAmount = totalAmount - amount;
      const processingFee = bank.processingFee;

      plans.push({
        id: `emi_${bank.code}_${tenure}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
        bank: bank.name,
        bankCode: bank.code,
        cardType: cardType,
        tenure: tenure,
        interest: interestRate,
        emiAmount: emiAmount,
        totalAmount: totalAmount,
        processingFee: processingFee,
        interestAmount: interestAmount,
        emiType: tenure <= 6 ? 'no_cost' : 'credit_card',
        eligibility: {
          minAmount: RAZORPAY_EMI_CONFIG.minAmount,
          maxAmount: cardType === 'debit' ? 200000 : RAZORPAY_EMI_CONFIG.maxAmount,
          cardTypes: [cardType],
          minCreditScore: cardType === 'credit' ? 650 : undefined
        },
        features: [
          'Zero down payment',
          'Flexible tenure',
          'Easy approval',
          'No hidden charges'
        ],
        terms: [
          `Interest rate: ${interestRate}% p.a.`,
          `Processing fee: ₹${processingFee}`,
          'Subject to bank approval',
          'Terms and conditions apply'
        ],
        partnerBanks: [bank.name]
      });
    });
  });

  return plans;
};

// Get EMI plans using Razorpay
export const getEMIPlans = async (req, res) => {
  try {
    const { amount, cardType = 'credit' } = req.query;
    // Note: This is a public endpoint, no user authentication required

    if (!amount || amount < RAZORPAY_EMI_CONFIG.minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum amount for EMI is ₹${RAZORPAY_EMI_CONFIG.minAmount}`
      });
    }

    const amountNum = parseInt(amount);

    try {
      // Get Razorpay instance
      const razorpayInstance = await getRazorpayInstance();
      if (!razorpayInstance) {
        // If Razorpay is not configured, return empty plans - only dynamic data
        console.log('⚠️ Razorpay not configured, returning empty plans');
        return res.json({
          success: true,
          data: {
            plans: [],
            totalPlans: 0,
            amount: amountNum,
            cardType: cardType,
            message: 'EMI plans temporarily unavailable. Please try again later.',
            emiTypes: [
              { type: 'credit_card', name: 'Credit Card EMI', minAmount: 3000, maxAmount: 1000000 },
              { type: 'debit_card', name: 'Debit Card EMI', minAmount: 3000, maxAmount: 200000 },
              { type: 'no_cost', name: 'No Cost EMI', minAmount: 3000, maxAmount: 100000 }
            ]
          }
        });
      }

      // Fetch EMI plans from Razorpay using /methods API
      // This API requires only KEY_ID, not KEY_SECRET
      const razorpayMethod = await PaymentMethod.findOne({ 
        name: 'Razorpay', 
        isActive: true 
      });

      if (!razorpayMethod || !razorpayMethod.config?.razorpayKeyId) {
        throw new Error('Razorpay key not configured');
      }

      // Call Razorpay methods API to get EMI plans
      // Using Razorpay's REST API directly since SDK might not have this method
      let razorpayMethods = null;
      
      try {
        const auth = Buffer.from(`${razorpayMethod.config.razorpayKeyId}:${razorpayMethod.config.razorpayKeySecret || ''}`).toString('base64');
        
        const options = {
          hostname: 'api.razorpay.com',
          path: `/v1/methods?amount=${amountNum * 100}&currency=INR`,
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        };

        console.log('🔍 Razorpay connected! Fetching EMI plans and bank offers for amount:', amountNum);

        // Fetch methods from Razorpay - This will return all available payment methods including EMI
        razorpayMethods = await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            
            // Handle HTTP errors
            if (res.statusCode < 200 || res.statusCode >= 300) {
              res.on('data', (chunk) => {
                data += chunk.toString();
              });
              res.on('end', () => {
                // Don't reject, just log and continue with fallback
                resolve(null);
              });
              return;
            }
            
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                if (!data) {
                  console.warn('⚠️ Empty response from Razorpay API');
                  resolve(null);
                  return;
                }
                const parsed = JSON.parse(data);
                console.log('✅ Razorpay connected! Methods received:', Object.keys(parsed.methods || {}));
                if (parsed.methods && parsed.methods.emi) {
                  console.log('✅ EMI options available from Razorpay:', Object.keys(parsed.methods.emi));
                }
                resolve(parsed);
              } catch (e) {
                resolve(null);
              }
            });
          });
          req.on('error', (error) => {
            // Don't reject, just resolve with null to use fallback
            resolve(null);
          });
          req.setTimeout(10000, () => {
            req.destroy();
            console.warn('⚠️ Razorpay API request timeout');
            resolve(null);
          });
          req.end();
        });
      } catch (apiError) {
        razorpayMethods = null;
      }

      // Extract EMI plans from Razorpay methods response - ONLY dynamic data from Razorpay
      // As soon as Razorpay is connected, EMI options and bank offers will be available
      let formattedPlans = [];
      
      if (razorpayMethods && razorpayMethods.methods && razorpayMethods.methods.emi) {
        try {
          const emiMethods = razorpayMethods.methods.emi;
          console.log('📊 Razorpay connected! Processing EMI methods and bank offers:', Object.keys(emiMethods));
          console.log('📊 Available banks with EMI options:', Object.keys(emiMethods));
          
          // Process each bank's EMI options from Razorpay
          Object.keys(emiMethods).forEach((bankCode) => {
            const bankEMI = emiMethods[bankCode];
            
            // Handle different response structures from Razorpay
            if (Array.isArray(bankEMI)) {
              // If bankEMI is an array of options
              bankEMI.forEach((emiOption) => {
                // Process each tenure option
                if (emiOption.tenures && Array.isArray(emiOption.tenures)) {
                  emiOption.tenures.forEach((tenure) => {
                    // Use Razorpay's actual data - no fallback calculations
                    const emiAmount = tenure.emi_amount || 0;
                    const totalAmount = tenure.total_amount || (emiAmount * tenure.tenure);
                    const interestAmount = totalAmount - amountNum;

                    formattedPlans.push({
                      id: tenure.id || `emi_${bankCode}_${tenure.tenure}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                      bank: tenure.bank_name || bankCode,
                      bankCode: bankCode,
                      cardType: cardType,
                      tenure: tenure.tenure,
                      interest: tenure.interest_rate || 0,
                      emiAmount: emiAmount,
                      totalAmount: totalAmount,
                      processingFee: tenure.processing_fee || 0,
                      interestAmount: interestAmount,
                      emiType: tenure.emi_type || 'credit_card',
                      eligibility: {
                        minAmount: tenure.min_amount || RAZORPAY_EMI_CONFIG.minAmount,
                        maxAmount: tenure.max_amount || (cardType === 'debit' ? 200000 : RAZORPAY_EMI_CONFIG.maxAmount),
                        cardTypes: tenure.card_types || [cardType],
                        minCreditScore: tenure.min_credit_score
                      },
                      features: tenure.features || [],
                      terms: tenure.terms || [],
                      partnerBanks: tenure.partner_banks || [bankCode]
                    });
                  });
                }
              });
            } else if (bankEMI && typeof bankEMI === 'object') {
              // If bankEMI is an object with tenures directly
              if (bankEMI.tenures && Array.isArray(bankEMI.tenures)) {
                bankEMI.tenures.forEach((tenure) => {
                  const emiAmount = tenure.emi_amount || 0;
                  const totalAmount = tenure.total_amount || (emiAmount * tenure.tenure);
                  const interestAmount = totalAmount - amountNum;

                  formattedPlans.push({
                    id: tenure.id || `emi_${bankCode}_${tenure.tenure}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    bank: tenure.bank_name || bankCode,
                    bankCode: bankCode,
                    cardType: cardType,
                    tenure: tenure.tenure,
                    interest: tenure.interest_rate || 0,
                    emiAmount: emiAmount,
                    totalAmount: totalAmount,
                    processingFee: tenure.processing_fee || 0,
                    interestAmount: interestAmount,
                    emiType: tenure.emi_type || 'credit_card',
                    eligibility: {
                      minAmount: tenure.min_amount || RAZORPAY_EMI_CONFIG.minAmount,
                      maxAmount: tenure.max_amount || (cardType === 'debit' ? 200000 : RAZORPAY_EMI_CONFIG.maxAmount),
                      cardTypes: tenure.card_types || [cardType],
                      minCreditScore: tenure.min_credit_score
                    },
                    features: tenure.features || [],
                    terms: tenure.terms || [],
                    partnerBanks: tenure.partner_banks || [bankCode]
                  });
                });
              }
            }
          });
          console.log('✅ Razorpay connected! Processed', formattedPlans.length, 'EMI plans with bank offers (dynamic data from Razorpay)');
        } catch (parseError) {
          formattedPlans = [];
        }
      } else {
        console.log('⚠️ No EMI methods found in Razorpay response');
        if (razorpayMethods) {
          console.log('📊 Available methods:', Object.keys(razorpayMethods.methods || {}));
        }
      }

      // Only use Razorpay dynamic data - no static fallback
      if (formattedPlans.length === 0) {
        console.log('⚠️ No EMI plans available from Razorpay for this amount');
      }

      res.json({
        success: true,
        data: {
          plans: formattedPlans,
          totalPlans: formattedPlans.length,
          amount: amountNum,
          cardType: cardType,
          emiTypes: [
            { type: 'credit_card', name: 'Credit Card EMI', minAmount: 3000, maxAmount: 1000000 },
            { type: 'debit_card', name: 'Debit Card EMI', minAmount: 3000, maxAmount: 200000 },
            { type: 'no_cost', name: 'No Cost EMI', minAmount: 3000, maxAmount: 100000 }
          ]
        }
      });
    } catch (razorpayError) {
      
      // Return empty plans - only use Razorpay dynamic data
      res.json({
        success: true,
        data: {
          plans: [],
          totalPlans: 0,
          amount: amountNum,
          cardType: cardType,
          message: 'EMI plans temporarily unavailable. Please try again later.',
          emiTypes: [
            { type: 'credit_card', name: 'Credit Card EMI', minAmount: 3000, maxAmount: 1000000 },
            { type: 'debit_card', name: 'Debit Card EMI', minAmount: 3000, maxAmount: 200000 },
            { type: 'no_cost', name: 'No Cost EMI', minAmount: 3000, maxAmount: 100000 }
          ]
        }
      });
    }
  } catch (error) {
    
    // Return empty plans - only use Razorpay dynamic data, no static fallback
    const amountNum = parseInt(req.query.amount) || 0;
    const cardType = req.query.cardType || 'credit';
    
    res.json({
      success: true,
      data: {
        plans: [],
        totalPlans: 0,
        amount: amountNum,
        cardType: cardType,
        message: 'EMI plans temporarily unavailable. Please try again later.',
        emiTypes: [
          { type: 'credit_card', name: 'Credit Card EMI', minAmount: 3000, maxAmount: 1000000 },
          { type: 'debit_card', name: 'Debit Card EMI', minAmount: 3000, maxAmount: 200000 },
          { type: 'no_cost', name: 'No Cost EMI', minAmount: 3000, maxAmount: 100000 }
        ]
      }
    });
  }
};

// Validate EMI eligibility with Razorpay
export const validateEMIEligibility = async (req, res) => {
  try {
    const { bankCode, amount, cardNumber, customerDetails } = req.body;
    const userId = req.user.id;

    if (!bankCode || !amount || !cardNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    // Check amount limits
    if (amount < RAZORPAY_EMI_CONFIG.minAmount || amount > RAZORPAY_EMI_CONFIG.maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Amount must be between ₹${RAZORPAY_EMI_CONFIG.minAmount} and ₹${RAZORPAY_EMI_CONFIG.maxAmount}`
      });
    }

    try {
      // Get Razorpay instance
      const razorpayInstance = await getRazorpayInstance();
      if (!razorpayInstance) {
        throw new Error('Razorpay not configured');
      }

      // Call Razorpay eligibility API
      const eligibilityResponse = await razorpayInstance.payments.validateEMI({
        amount: amount * 100, // Convert to paise
        bank_code: bankCode,
        card_number: cardNumber,
        currency: 'INR'
      });

      if (eligibilityResponse.eligible) {
        res.json({
          success: true,
          data: {
            eligible: true,
            message: eligibilityResponse.message || `${bankCode} EMI eligible for this transaction`,
            bankCode: bankCode,
            amount: amount,
            cardNumber: cardNumber.replace(/\d(?=\d{4})/g, '*'), // Mask card number
            emiType: eligibilityResponse.emi_type,
            availableTenures: eligibilityResponse.available_tenures || RAZORPAY_EMI_CONFIG.supportedTenures,
            processingFee: eligibilityResponse.processing_fee || 0,
            partnerBanks: eligibilityResponse.partner_banks || [bankCode]
          }
        });
      } else {
        res.json({
          success: true,
          data: {
            eligible: false,
            message: eligibilityResponse.message || 'EMI not eligible for this transaction',
            reason: eligibilityResponse.reason || 'Card not eligible for EMI conversion'
          }
        });
      }
    } catch (razorpayError) {
      
      // Fallback: Basic validation if Razorpay API fails
      res.json({
        success: true,
        data: {
          eligible: false,
          message: 'Unable to verify EMI eligibility at this time. Please try again later.',
          reason: 'Service temporarily unavailable'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to validate EMI eligibility',
      error: error.message
    });
  }
};

// Process EMI payment with Razorpay
export const processEMIPayment = async (req, res) => {
  try {
    const { planId, amount, cardDetails, customerDetails, orderId } = req.body;
    const userId = req.user.id;

    if (!planId || !amount || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    // Validate amount limits
    if (amount < RAZORPAY_EMI_CONFIG.minAmount || amount > RAZORPAY_EMI_CONFIG.maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Amount must be between ₹${RAZORPAY_EMI_CONFIG.minAmount} and ₹${RAZORPAY_EMI_CONFIG.maxAmount}`
      });
    }

    try {
      // Get Razorpay payment method config
      const razorpayMethod = await PaymentMethod.findOne({ 
        name: 'Razorpay', 
        isActive: true 
      });
      
      if (!razorpayMethod || !razorpayMethod.config?.razorpayKeyId || !razorpayMethod.config?.razorpayKeySecret) {
        return res.status(400).json({
          success: false,
          message: 'Razorpay credentials not configured. Please contact administrator.'
        });
      }

      // Get Razorpay instance
      const razorpayInstance = await getRazorpayInstance();
      if (!razorpayInstance) {
        throw new Error('Razorpay not configured');
      }

      // Generate transaction ID
      const transactionId = `RAZORPAY_EMI_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Create Razorpay order for EMI
      const razorpayOrder = await razorpayInstance.orders.create({
        amount: amount * 100, // Razorpay expects amount in paise
        currency: 'INR',
        receipt: `EMI_${transactionId}`,
        notes: {
          emi_plan_id: planId,
          user_id: userId.toString(),
          order_id: orderId,
          payment_type: 'emi'
        }
      });

      // Get EMI plan details from Razorpay
      const emiPlanDetails = await razorpayInstance.payments.getEMIPlan(planId);

      res.json({
        success: true,
        data: {
          transactionId: transactionId,
          razorpayOrderId: razorpayOrder.id,
          message: 'EMI payment initiated successfully',
          planId: planId,
          amount: amount,
          tenure: emiPlanDetails.tenure,
          bankCode: emiPlanDetails.bank_code,
          bankName: emiPlanDetails.bank_name,
          emiType: emiPlanDetails.emi_type,
          processingFee: emiPlanDetails.processing_fee || 0,
          emiAmount: emiPlanDetails.emi_amount,
          totalAmount: emiPlanDetails.total_amount,
          interestAmount: emiPlanDetails.interest_amount,
          interestRate: emiPlanDetails.interest_rate,
          razorpayKey: razorpayMethod.config.razorpayKeyId,
          settlementInfo: {
            merchantReceives: amount, // Full amount settled to merchant
            customerPays: emiPlanDetails.total_amount, // Customer pays total with interest
            bankHandlesEMI: true, // Bank/NBFC handles EMI conversion
            conversionType: emiPlanDetails.emi_type
          }
        }
      });
    } catch (razorpayError) {
      
      res.status(500).json({
        success: false,
        message: 'Failed to create EMI payment order',
        error: razorpayError.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process EMI payment',
      error: error.message
    });
  }
};
// Get EMI transaction history
export const getEMITransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    try {
      // Get Razorpay instance
      const razorpayInstance = await getRazorpayInstance();
      if (!razorpayInstance) {
        throw new Error('Razorpay not configured');
      }

      // Fetch Razorpay orders for EMI transactions
      const razorpayOrders = await razorpayInstance.orders.all({
        count: parseInt(limit),
        skip: (parseInt(page) - 1) * parseInt(limit)
      });

      // Filter EMI orders and format response
      const emiTransactions = [];
      
      for (const order of razorpayOrders.items) {
        if (order.notes && order.notes.payment_type === 'emi') {
          try {
            // Get EMI plan details from Razorpay
            const emiPlanDetails = await razorpayInstance.payments.getEMIPlan(order.notes.emi_plan_id);
            
            emiTransactions.push({
              id: order.id,
              planId: order.notes.emi_plan_id,
              amount: order.amount / 100,
              emiAmount: emiPlanDetails.emi_amount,
              tenure: emiPlanDetails.tenure,
              bankCode: emiPlanDetails.bank_code,
              bankName: emiPlanDetails.bank_name,
              emiType: emiPlanDetails.emi_type,
              interestRate: emiPlanDetails.interest_rate,
              totalAmount: emiPlanDetails.total_amount,
              interestAmount: emiPlanDetails.interest_amount,
              status: order.status === 'paid' ? 'active' : 'pending',
              createdAt: new Date(order.created_at * 1000).toISOString(),
              nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            });
          } catch (planError) {
            // Skip this transaction if plan details can't be fetched
            continue;
          }
        }
      }

      res.json({
        success: true,
        data: {
          transactions: emiTransactions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: emiTransactions.length,
            pages: Math.ceil(emiTransactions.length / parseInt(limit))
          }
        }
      });
    } catch (razorpayError) {
      
      // Fallback: Return empty transactions if Razorpay API fails
      res.json({
        success: true,
        data: {
          transactions: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          },
          message: 'Transaction history temporarily unavailable. Please try again later.'
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch EMI transactions',
      error: error.message
    });
  }
};

