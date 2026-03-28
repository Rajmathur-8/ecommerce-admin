import OrderModel from '../../models/order.js';
import UserModel from '../../models/user.js';
import ProductModel from '../../models/product.js';
import notificationService from '../../services/notificationService.js';
import { createTransactionForCODOrder } from './transactionController.js';

// Get all orders with pagination and filters
export const getAllOrders = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = '', 
      paymentStatus = '',
      isPreOrder = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const skip = (page - 1) * limit;
    let query = {};

    // Search filter
    if (search) {
      query.$or = [
        { _id: { $regex: search, $options: 'i' } },
        { 'address.name': { $regex: search, $options: 'i' } },
        { 'address.mobile': { $regex: search, $options: 'i' } },
        { 'address.email': { $regex: search, $options: 'i' } }
      ];
    }

    // Status filter
    if (status && status !== 'all') {
      query.orderStatus = status;
    }

    // Payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      query.paymentStatus = paymentStatus;
    }

    // Pre-order filter
    if (isPreOrder && isPreOrder !== 'all') {
      query.isPreOrder = isPreOrder === 'true';
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

    const orders = await OrderModel.find(query)
      .populate('user', 'email name phone')
      .populate('items.product', 'productName images price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Ensure user details are properly populated for all orders
    for (let order of orders) {
      if (order.user && (!order.user.name || !order.user.phone)) {
        const userDetails = await UserModel.findById(order.user._id, 'email name phone');
        if (userDetails) {
          order.user = userDetails;
        }
      }
    }

    const total = await OrderModel.countDocuments(query);

    // Get order statistics
    const stats = await OrderModel.aggregate([
      { $match: {} },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'pending'] }, 1, 0] }
          },
          confirmedOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'confirmed'] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'shipped'] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 1, 0] }
          },
          returnedOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'returned'] }, 1, 0] }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalOrders: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        },
        stats: stats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          pendingOrders: 0,
          confirmedOrders: 0,
          shippedOrders: 0,
          deliveredOrders: 0,
          cancelledOrders: 0,
          returnedOrders: 0
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

// Get order details by ID
export const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderModel.findById(orderId)
      .populate('user', 'email name phone referralCode')
      .populate('items.product', 'productName images price description category shipmentLength shipmentWidth shipmentHeight shipmentWeight')
      .populate('items.warranty', 'name description duration price coverage')
      .populate('frequentlyBoughtTogether.product', 'productName images price')
      .lean();

    // If user data is not properly populated, fetch it separately
    if (order && order.user && (!order.user.name || !order.user.phone)) {
      const userDetails = await UserModel.findById(order.user._id, 'email name phone referralCode');
      if (userDetails) {
        order.user = userDetails;
      }
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get order timeline
    const timeline = [
      {
        status: 'Order Placed',
        date: order.createdAt,
        description: 'Order has been placed successfully'
      }
    ];

    // Only show "Order Confirmed" if order status is 'confirmed' or beyond (shipped, delivered)
    // If order is cancelled without confirmation, skip this step
    if (['confirmed', 'shipped', 'delivered'].includes(order.orderStatus)) {
      // Use logisticsSyncedAt as confirmation date if available (since orders are confirmed when logistics is synced)
      // Otherwise, use updatedAt
      const confirmedDate = order.logisticsSyncedAt || order.updatedAt;
      timeline.push({
        status: 'Order Confirmed',
        date: confirmedDate,
        description: 'Order has been confirmed'
      });
    }

    // Add shipping step if logistics is synced
    if (order.logisticsSynced) {
      timeline.push({
        status: 'Shipping Arranged',
        date: order.logisticsSyncedAt || order.updatedAt,
        description: order.ithinkAwbNumber ? 
          `Shipment created with iThink Logistics (AWB: ${order.ithinkAwbNumber})` : 
          'Shipment created and logistics partner assigned'
      });
    }

    if (['shipped', 'delivered'].includes(order.orderStatus)) {
      timeline.push({
        status: 'Order Shipped',
        date: order.updatedAt,
        description: order.trackingNumber ? `Order shipped with tracking number: ${order.trackingNumber}` : 'Order has been shipped'
      });
    }

    if (order.orderStatus === 'delivered') {
      timeline.push({
        status: 'Order Delivered',
        date: order.updatedAt,
        description: 'Order has been delivered successfully'
      });
    }

    if (order.orderStatus === 'cancelled') {
      timeline.push({
        status: 'Order Cancelled',
        date: order.updatedAt,
        description: 'Order has been cancelled'
      });
    }

    if (order.orderStatus === 'returned') {
      timeline.push({
        status: 'Order Returned',
        date: order.returnDate || order.updatedAt,
        description: order.returnReason ? `Order returned: ${order.returnReason}` : 'Order has been returned'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        order,
        timeline
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    console.log('🔄 Admin order status update request received');
    console.log('📋 Request params:', req.params);
    console.log('📦 Request body:', req.body);
    console.log('🔑 Request headers:', req.headers);
    console.log('🌐 Request URL:', req.url);
    console.log('🔧 Request method:', req.method);
    
    const { orderId } = req.params;
    const { orderStatus, trackingNumber, estimatedDelivery, returnReason, returnDescription } = req.body;
    
    console.log('📝 Extracted data:');
    console.log('- orderId:', orderId);
    console.log('- orderStatus:', orderStatus);
    console.log('- trackingNumber:', trackingNumber);

    const order = await OrderModel.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    console.log('📋 Current order details:');
    console.log('- Order ID:', order._id);
    console.log('- Current Status:', order.orderStatus);
    console.log('- User:', order.user);
    console.log('- Address:', order.address);

    // Validate status transition
    const validTransitions = {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['shipped', 'cancelled'],
      'shipped': ['delivered', 'returned'],
      'delivered': ['returned'],
      'cancelled': [],
      'returned': []
    };

    if (!validTransitions[order.orderStatus]?.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${order.orderStatus} to ${orderStatus}`
      });
    }

    // Update order
    const updateData = { orderStatus };
    
    if (orderStatus === 'shipped' && trackingNumber) {
      updateData.trackingNumber = trackingNumber;
    }
    
    if (orderStatus === 'shipped' && estimatedDelivery) {
      updateData.estimatedDelivery = estimatedDelivery;
    }
    
    if (orderStatus === 'returned') {
      updateData.returnReason = returnReason;
      updateData.returnDescription = returnDescription;
      updateData.returnDate = new Date();
    }
    
    // Auto-update payment status when order is delivered
    if (orderStatus === 'delivered' && order.paymentStatus === 'pending') {
      updateData.paymentStatus = 'completed';
      console.log('💰 Auto-updating payment status to completed for delivered order');
    }

    const updatedOrder = await OrderModel.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true }
    ).populate('user', 'email name phone')
     .populate('items.product', 'productName images price');

    // Ensure user details are properly populated
    if (updatedOrder && updatedOrder.user && (!updatedOrder.user.name || !updatedOrder.user.phone)) {
      const userDetails = await UserModel.findById(updatedOrder.user._id, 'email name phone');
      if (userDetails) {
        updatedOrder.user = userDetails;
      }
    }

    // When order is confirmed, mark it as ready for shipment creation
    if (orderStatus === 'confirmed' && order.orderStatus !== 'confirmed') {
      try {
        console.log('✅ Order confirmed - ready for shipment creation');
        // Order is now confirmed and ready for shipment page
        // The shipment page will be opened automatically from the frontend
      } catch (error) {
      }
    }

    // Send notification if status changed
    console.log('🔍 Checking notification conditions:');
    console.log('- orderStatus:', orderStatus);
    console.log('- order.orderStatus:', order.orderStatus);
    console.log('- Status changed?', orderStatus && orderStatus !== order.orderStatus);
    
    if (orderStatus && orderStatus !== order.orderStatus) {
      try {
        console.log(`🔔 Sending order status notification for order ${orderId}: ${orderStatus}`);
        console.log('📋 Order data for notification:', {
          orderId: updatedOrder._id,
          userEmail: updatedOrder.user?.email,
          userPhone: updatedOrder.user?.phone,
          orderStatus: orderStatus,
          trackingNumber: trackingNumber
        });
        
        // Debug: Log the complete order object structure
        console.log('🔍 Complete order object structure:');
        console.log('- Order ID:', updatedOrder._id);
        console.log('- User object:', updatedOrder.user);
        console.log('- Address object:', updatedOrder.address);
        console.log('- Order status:', updatedOrder.orderStatus);
        console.log('- Payment status:', updatedOrder.paymentStatus);
        console.log('- Total amount:', updatedOrder.total);
        
        // Check if notification service is available
        if (!notificationService) {
          return;
        }
        
        // Check if order has required data
        if (!updatedOrder || !updatedOrder.address) {
          return;
        }
        
        console.log('🚀 Calling notification service...');
        await notificationService.sendOrderStatusNotifications(updatedOrder, orderStatus, trackingNumber);
        console.log('✅ Order status notification sent successfully');
      } catch (notificationError) {
        console.log({
          message: notificationError.message,
          stack: notificationError.stack
        });
        // Don't fail the order status update if notification fails
      }
    } else {
      console.log('⚠️ Notification not sent - status not changed or invalid');
    }

    // Create transaction for COD orders when delivered
    if (orderStatus === 'delivered' && order.paymentMethod === 'cod') {
      try {
        console.log('💰 Creating transaction for COD order:', orderId);
        await createTransactionForCODOrder(orderId);
        console.log('✅ Transaction creation process completed');
      } catch (transactionError) {
        // Don't fail the order status update if transaction creation fails
      }
    }

    console.log('✅ Order status update completed successfully');
    console.log('📤 Sending success response to admin panel');
    
    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        order: updatedOrder
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get order statistics
export const getOrderStats = async (req, res) => {
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

    const stats = await OrderModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          averageOrderValue: { $avg: '$total' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'pending'] }, 1, 0] }
          },
          confirmedOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'confirmed'] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'shipped'] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 1, 0] }
          },
          returnedOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'returned'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get daily orders for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyOrders = await OrderModel.aggregate([
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
          revenue: { $sum: '$total' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: stats[0] || {
          totalOrders: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          pendingOrders: 0,
          confirmedOrders: 0,
          shippedOrders: 0,
          deliveredOrders: 0,
          cancelledOrders: 0,
          returnedOrders: 0
        },
        dailyOrders
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update order details
export const updateOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const updateData = req.body;

    const order = await OrderModel.findByIdAndUpdate(
      orderId,
      updateData,
      { new: true }
    ).populate('user', 'email name phone')
     .populate('items.product', 'productName images price');

    // Ensure user details are properly populated
    if (order && order.user && (!order.user.name || !order.user.phone)) {
      const userDetails = await UserModel.findById(order.user._id, 'email name phone');
      if (userDetails) {
        order.user = userDetails;
      }
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order updated successfully',
      data: {
        order
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete order
export const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderModel.findByIdAndDelete(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Export orders to CSV
export const exportOrders = async (req, res) => {
  try {
    const { startDate, endDate, status, paymentStatus } = req.query;
    
    let query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    if (status && status !== 'all') {
      query.orderStatus = status;
    }

    if (paymentStatus && paymentStatus !== 'all') {
      query.paymentStatus = paymentStatus;
    }

    const orders = await OrderModel.find(query)
      .populate('user', 'email name phone')
      .populate('items.product', 'productName')
      .sort({ createdAt: -1 })
      .lean();

    // Ensure user details are properly populated for all orders
    for (let order of orders) {
      if (order.user && (!order.user.name || !order.user.phone)) {
        const userDetails = await UserModel.findById(order.user._id, 'email name phone');
        if (userDetails) {
          order.user = userDetails;
        }
      }
    }

    // Transform to CSV format
    const csvData = orders.map(order => ({
      'Order ID': order._id,
      'Customer Name': order.address.name,
      'Customer Email': order.user?.email || '',
      'Customer Phone': order.address.mobile,
      'Order Status': order.orderStatus,
      'Payment Status': order.paymentStatus,
      'Payment Method': order.paymentMethod,
      'Subtotal': order.subtotal,
      'Shipping Charges': order.shippingCharges,
      'Discount Amount': order.discountAmount,
      'Total Amount': order.total,
      'Order Date': new Date(order.createdAt).toLocaleDateString('en-IN'),
      'Items Count': order.items.length,
      'Razorpay Order ID': order.razorpayOrderId || '',
      'Razorpay Payment ID': order.razorpayPaymentId || ''
    }));

    res.status(200).json({
      success: true,
      data: {
        orders: csvData,
        filename: `orders_${new Date().toISOString().split('T')[0]}.csv`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Bulk update orders
export const bulkUpdateOrders = async (req, res) => {
  try {
    const { orderIds, updateData } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order IDs array is required'
      });
    }

    // Get current orders before update to check status changes
    const currentOrders = await OrderModel.find({ _id: { $in: orderIds } })
      .populate('user', 'email name phone');

    // Ensure user details are properly populated for all orders
    for (let order of currentOrders) {
      if (order.user && (!order.user.name || !order.user.phone)) {
        const userDetails = await UserModel.findById(order.user._id, 'email name phone');
        if (userDetails) {
          order.user = userDetails;
        }
      }
    }

    const result = await OrderModel.updateMany(
      { _id: { $in: orderIds } },
      updateData
    );

    // Send notifications for status changes
    if (updateData.orderStatus) {
      try {
        console.log('🔔 Sending bulk order status notifications...');
        
        for (const order of currentOrders) {
          if (order.orderStatus !== updateData.orderStatus) {
            console.log(`📋 Sending notification for order ${order._id}: ${order.orderStatus} → ${updateData.orderStatus}`);
            
            if (order.address) {
              try {
                await notificationService.sendOrderStatusNotifications(order, updateData.orderStatus, updateData.trackingNumber);
                console.log(`✅ Notification sent for order ${order._id}`);
              } catch (notificationError) {
              }
            } else {
            }
          }
        }
        
        console.log('✅ Bulk notifications completed');
      } catch (bulkNotificationError) {
        // Don't fail the bulk update if notifications fail
      }
    }

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} orders updated successfully`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Process refund
export const processRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { refundAmount, reason } = req.body;

    const order = await OrderModel.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (refundAmount > order.total) {
      return res.status(400).json({
        success: false,
        message: 'Refund amount cannot exceed order total'
      });
    }

    // Update order with refund information
    order.refundAmount = refundAmount;
    order.refundReason = reason;
    order.refundDate = new Date();
    order.orderStatus = 'refunded';
    order.paymentStatus = 'refunded';

    await order.save();

    // Send refund notification
    try {
      console.log('🔔 Sending refund notification for order:', orderId);
      
      // Populate user data for notification
      const orderWithUser = await OrderModel.findById(orderId)
        .populate('user', 'email name phone');

      // Ensure user details are properly populated
      if (orderWithUser && orderWithUser.user && (!orderWithUser.user.name || !orderWithUser.user.phone)) {
        const userDetails = await UserModel.findById(orderWithUser.user._id, 'email name phone');
        if (userDetails) {
          orderWithUser.user = userDetails;
        }
      }
      
      if (orderWithUser && orderWithUser.address) {
        console.log('📋 Order data for refund notification:', {
          orderId: orderWithUser._id,
          userEmail: orderWithUser.user?.email,
          userPhone: orderWithUser.address?.mobile,
          orderStatus: 'refunded',
          refundAmount: refundAmount
        });
        
        await notificationService.sendOrderStatusNotifications(orderWithUser, 'refunded');
        console.log('✅ Refund notification sent successfully');
      } else {
      }
    } catch (notificationError) {
      console.log({
        message: notificationError.message,
        stack: notificationError.stack
      });
      // Don't fail the refund process if notification fails
    }

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        order
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Generate invoice
export const generateInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await OrderModel.findById(orderId)
      .populate('user', 'email name phone')
      .populate('items.product', 'productName images price');

    // Ensure user details are properly populated
    if (order && order.user && (!order.user.name || !order.user.phone)) {
      const userDetails = await UserModel.findById(order.user._id, 'email name phone');
      if (userDetails) {
        order.user = userDetails;
      }
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Generate invoice data
    const invoiceData = {
      invoiceNumber: `INV-${order._id.toString().slice(-8).toUpperCase()}`,
      orderId: order._id,
      customer: {
        name: order.address.name,
        email: order.user?.email,
        phone: order.address.mobile,
        address: order.address
      },
      items: order.items,
      subtotal: order.subtotal,
      shippingCharges: order.shippingCharges,
      discountAmount: order.discountAmount,
      total: order.total,
      orderDate: order.createdAt,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    };

    res.status(200).json({
      success: true,
      data: {
        invoice: invoiceData
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create shipment for order
export const createShipment = async (req, res) => {
  try {
    const { orderId, shipmentDetails, logisticsPartnerId, ithinkData } = req.body;

    if (!orderId || !shipmentDetails || !logisticsPartnerId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, shipment details, and logistics partner ID are required'
      });
    }

    // Find the order
    const order = await OrderModel.findById(orderId).populate('items.product');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is confirmed
    if (order.orderStatus !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Order must be confirmed before creating shipment'
      });
    }

    // Check if shipment already exists
    if (order.logisticsSynced) {
      return res.status(400).json({
        success: false,
        message: 'Shipment already created for this order'
      });
    }

    // Import logistics service
    const logisticsService = (await import('../../services/logisticsService.js')).default;

    // Create shipment with logistics partner
    const shipmentResult = await logisticsService.syncOrderToIThinkLogistics(orderId, logisticsPartnerId);

    if (shipmentResult.success) {
      // Update order with shipment details
      order.shipmentDetails = {
        length: shipmentDetails.length,
        width: shipmentDetails.width,
        height: shipmentDetails.height,
        weight: shipmentDetails.weight,
        volume: (shipmentDetails.length * shipmentDetails.width * shipmentDetails.height / 1000000).toFixed(2)
      };
      order.logisticsPartner = logisticsPartnerId;
      order.logisticsSynced = true;
      order.logisticsSyncedAt = new Date();
      order.orderStatus = 'shipped';
      
      if (shipmentResult.awbNumber) {
        order.ithinkAwbNumber = shipmentResult.awbNumber;
      }
      if (shipmentResult.trackingNumber) {
        order.ithinkTrackingNumber = shipmentResult.trackingNumber;
      }

      // Store iThink Logistics data if provided
      if (ithinkData) {
        order.ithinkLogisticsData = ithinkData;
      }

      await order.save();

      // Send notification to customer
      try {
        await notificationService.sendOrderStatusNotifications(order, 'shipped', shipmentResult.trackingNumber || shipmentResult.awbNumber);
      } catch (notificationError) {
        // Don't fail the shipment creation if notification fails
      }

      res.json({
        success: true,
        message: 'Shipment created successfully with iThink Logistics',
        data: {
          orderId: order._id,
          awbNumber: shipmentResult.awbNumber,
          trackingNumber: shipmentResult.trackingNumber,
          shipmentDetails: order.shipmentDetails,
          logisticsPartner: logisticsPartnerId,
          ithinkData: shipmentResult.deliveryDetails
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: shipmentResult.message || 'Failed to create shipment'
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};
