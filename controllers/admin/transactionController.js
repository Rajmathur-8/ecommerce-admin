import OrderModel from '../../models/order.js';
import TransactionModel from '../../models/transaction.js';

// Get all transactions with pagination and filters
export const getAllTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = '', 
      method = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const skip = (page - 1) * limit;
    let query = {};

    // Search filter
    if (search) {
      query.$or = [
        { _id: { $regex: search, $options: 'i' } },
        { 'order.address.name': { $regex: search, $options: 'i' } },
        { 'order.address.mobile': { $regex: search, $options: 'i' } },
        { razorpayPaymentId: { $regex: search, $options: 'i' } },
        { razorpayOrderId: { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status && status !== 'all') {
      query.status = status;
    }

    // Method filter
    if (method && method !== 'all') {
      query.method = method;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const transactions = await TransactionModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await TransactionModel.countDocuments(query);

    // Get transaction statistics
    const stats = await TransactionModel.aggregate([
      { $match: {} },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          successfulTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          pendingTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          failedTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get payment method distribution
    const methodDistribution = await TransactionModel.aggregate([
      {
        $group: {
          _id: '$method',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalTransactions: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        },
        stats: stats[0] || {
          totalTransactions: 0,
          totalRevenue: 0,
          successfulTransactions: 0,
          pendingTransactions: 0,
          failedTransactions: 0
        },
        methodDistribution
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get transaction details by ID
export const getTransactionDetails = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await TransactionModel.findById(transactionId).lean();

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        transaction
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get transaction statistics
export const getTransactionStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await TransactionModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          averageTransactionValue: { $avg: '$amount' },
          successfulTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
          },
          pendingTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          failedTransactions: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get daily transactions for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyTransactions = await TransactionModel.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$amount' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get payment method distribution
    const methodDistribution = await TransactionModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$method',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: stats[0] || {
          totalTransactions: 0,
          totalRevenue: 0,
          averageTransactionValue: 0,
          successfulTransactions: 0,
          pendingTransactions: 0,
          failedTransactions: 0
        },
        dailyTransactions,
        methodDistribution
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create/Update transaction for COD order when delivered
export const createTransactionForCODOrder = async (orderId) => {
  try {
    console.log('🔄 Creating/Updating transaction for COD order:', orderId);
    
    const order = await OrderModel.findById(orderId)
      .populate('user', 'email name phone')
      .lean();

    if (!order) {
      return false;
    }

    // Check if order is COD and delivered (case-insensitive)
    const isCOD = order.paymentMethod?.toLowerCase() === 'cod';
    if (!isCOD || order.orderStatus !== 'delivered') {
      console.log('⏭️ Skipping transaction update - not COD or not delivered:', {
        paymentMethod: order.paymentMethod,
        orderStatus: order.orderStatus
      });
      return false;
    }

    // Check if transaction already exists
    const existingTransaction = await TransactionModel.findOne({ orderId: orderId });
    
    if (existingTransaction) {
      // Update existing transaction to success
      console.log('📝 Updating existing transaction to success status');
      existingTransaction.status = 'success';
      existingTransaction.transactionDate = new Date();
      existingTransaction.notes = 'COD payment collected on delivery';
      existingTransaction.order.paymentStatus = 'completed';
      existingTransaction.order.orderStatus = order.orderStatus;
      await existingTransaction.save();
      console.log('✅ Transaction updated successfully for delivered COD order:', orderId);
      return true;
    }

    // Create new transaction with success status
    const transaction = new TransactionModel({
      orderId: orderId,
      order: {
        _id: order._id,
        user: order.user,
        address: order.address,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: 'completed',
        orderStatus: order.orderStatus,
        createdAt: order.createdAt
      },
      amount: order.total,
      currency: 'INR',
      status: 'success',
      method: 'cod',
      gatewayFee: 0,
      netAmount: order.total,
      transactionDate: new Date(),
      notes: 'COD payment collected on delivery'
    });

    await transaction.save();
    console.log('✅ Transaction created successfully for delivered COD order:', orderId);
    return true;

  } catch (error) {
    return false;
  }
};

// Create transaction for Razorpay order (for existing orders)
export const createTransactionForRazorpayOrder = async (orderId) => {
  try {
    console.log('🔄 Creating transaction for Razorpay order:', orderId);
    
    const order = await OrderModel.findById(orderId)
      .populate('user', 'email name phone')
      .lean();

    if (!order) {
      return false;
    }

    // Check if order is Razorpay and payment is completed (case-insensitive)
    const isRazorpay = order.paymentMethod?.toLowerCase() === 'razorpay';
    if (!isRazorpay || order.paymentStatus !== 'completed') {
      console.log('⏭️ Skipping transaction creation - not Razorpay or payment not completed:', {
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        isRazorpay
      });
      return false;
    }

    // Check if transaction already exists
    const existingTransaction = await TransactionModel.findOne({ orderId: orderId });
    if (existingTransaction) {
      console.log('⏭️ Transaction already exists for order:', orderId);
      return true;
    }

    // Create new transaction
    const transaction = new TransactionModel({
      orderId: orderId,
      order: {
        _id: order._id,
        user: order.user,
        address: order.address,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt
      },
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
      amount: order.total,
      currency: 'INR',
      status: 'success',
      method: 'razorpay',
      gatewayFee: 0, // This would be calculated based on actual gateway fees
      netAmount: order.total,
      transactionDate: order.createdAt, // Transaction date is when order was created
      notes: 'Razorpay payment processed'
    });

    await transaction.save();
    console.log('✅ Transaction created successfully for Razorpay order:', orderId);
    return true;

  } catch (error) {
    return false;
  }
};

// Create transaction for COD order (pending status)
export const createTransactionForCODOrderPending = async (orderId) => {
  try {
    console.log('🔄 Creating pending transaction for COD order:', orderId);
    
    const order = await OrderModel.findById(orderId)
      .populate('user', 'email name phone')
      .lean();

    if (!order) {
      return false;
    }

    // Check if order is COD (case-insensitive)
    const isCOD = order.paymentMethod?.toLowerCase() === 'cod';
    if (!isCOD) {
      console.log('⏭️ Skipping transaction creation - not COD:', {
        paymentMethod: order.paymentMethod
      });
      return false;
    }

    // Check if transaction already exists
    const existingTransaction = await TransactionModel.findOne({ orderId: orderId });
    if (existingTransaction) {
      console.log('⏭️ Transaction already exists for order:', orderId);
      return true;
    }

    // Create new transaction with pending status
    const transaction = new TransactionModel({
      orderId: orderId,
      order: {
        _id: order._id,
        user: order.user,
        address: order.address,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt
      },
      amount: order.total,
      currency: 'INR',
      status: order.orderStatus === 'delivered' ? 'success' : 'pending',
      method: 'cod',
      gatewayFee: 0,
      netAmount: order.total,
      transactionDate: order.orderStatus === 'delivered' ? new Date() : order.createdAt,
      notes: order.orderStatus === 'delivered' ? 'COD payment collected on delivery' : 'COD - Payment pending'
    });

    await transaction.save();
    console.log('✅ Transaction created successfully for COD order:', orderId);
    return true;

  } catch (error) {
    return false;
  }
};

// Sync transactions for all orders (Razorpay and COD)
export const syncTransactions = async (req, res) => {
  try {
    console.log('🔄 Starting transaction sync for all orders...');
    
    // Find all orders that don't have transactions
    const orders = await OrderModel.find({}).lean();
    
    console.log(`📋 Found ${orders.length} total orders`);
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const order of orders) {
      try {
        // Check if transaction already exists
        const existingTransaction = await TransactionModel.findOne({ orderId: order._id });
        if (existingTransaction) {
          console.log(`⏭️ Transaction already exists for order: ${order._id}`);
          skipped++;
          continue;
        }
        
        // Check payment method
        const paymentMethod = order.paymentMethod?.toLowerCase();
        let result = false;
        
        if (paymentMethod === 'razorpay' && order.paymentStatus === 'completed') {
          // Create transaction for completed Razorpay payment
          result = await createTransactionForRazorpayOrder(order._id);
        } else if (paymentMethod === 'cod') {
          // Create transaction for COD order (any status)
          result = await createTransactionForCODOrderPending(order._id);
        } else {
          skipped++;
          continue;
        }
        
        if (result) {
          created++;
          console.log(`✅ Created transaction for order: ${order._id}`);
        } else {
          failed++;
          console.log(`❌ Failed to create transaction for order: ${order._id}`);
        }
      } catch (error) {
        failed++;
      }
    }
    
    console.log('✅ Transaction sync completed:', { created, skipped, failed });
    
    res.status(200).json({
      success: true,
      message: 'Transaction sync completed',
      data: {
        totalOrders: orders.length,
        created,
        skipped,
        failed
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to sync transactions',
      error: error.message
    });
  }
};

// Export transactions to CSV
export const exportTransactions = async (req, res) => {
  try {
    const { startDate, endDate, status, method } = req.query;
    
    let query = {};

    // Apply filters
    if (status && status !== 'all') {
      query.status = status;
    }

    if (method && method !== 'all') {
      query.method = method;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const transactions = await TransactionModel.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Transform to CSV format
    const csvData = transactions.map(transaction => ({
      'Transaction ID': transaction._id,
      'Order ID': transaction.orderId,
      'Customer Name': transaction.order.address.name,
      'Customer Email': transaction.order.user?.email || '',
      'Customer Phone': transaction.order.address.mobile,
      'Net Amount': transaction.netAmount || transaction.amount,
      'Payment Method': transaction.method,
      'Payment Status': transaction.status,
      'Razorpay Order ID': transaction.razorpayOrderId || '',
      'Razorpay Payment ID': transaction.razorpayPaymentId || '',
      'Transaction Date': new Date(transaction.transactionDate || transaction.createdAt).toLocaleDateString('en-IN'),
      'Order Status': transaction.order.orderStatus,
      'Notes': transaction.notes || ''
    }));

    res.status(200).json({
      success: true,
      data: {
        transactions: csvData,
        filename: `transactions_${new Date().toISOString().split('T')[0]}.csv`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

