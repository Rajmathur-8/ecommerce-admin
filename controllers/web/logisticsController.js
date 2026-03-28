import axios from 'axios';
import logisticsService from '../../services/logisticsService.js';
import DeliveryTracking from '../../models/deliveryTracking.js';
import Order from '../../models/order.js';
import Settings from '../../models/settings.js';

// Calculate shipping charges for an order
export const calculateShippingCharges = async (req, res) => {
  try {
    const { orderId, pincode, weight, orderValue } = req.body;

    if (!pincode) {
      return res.status(400).json({
        success: false,
        message: 'Pincode is required'
      });
    }

    let shippingOptions;

    if (orderId) {
      // Calculate with existing order
      shippingOptions = await logisticsService.calculateShippingCharges(orderId, pincode, weight);
    } else {
      // Calculate without order (for address selection)
      const query = { isActive: true, status: 'active' };
      // Check if pincode is in restricted list, if not, it's available
      query.restrictedPincodes = { $ne: pincode };

      const availablePartners = await ShippingPartner.find(query);
      shippingOptions = [];

      for (const partner of availablePartners) {
        const { pricing, deliveryTime } = partner;
        
        // Make all shipping free for customers
        let shippingCost = 0;

        // Check weight limits
        if (weight && (weight > partner.weightLimits.max || weight < partner.weightLimits.min)) {
          continue; // Skip this partner if weight is out of range
        }

        // Calculate estimated delivery
        const avgDays = (deliveryTime.min + deliveryTime.max) / 2;
        const estimatedDate = new Date();
        if (deliveryTime.unit === 'days') {
          estimatedDate.setDate(estimatedDate.getDate() + avgDays);
        } else if (deliveryTime.unit === 'weeks') {
          estimatedDate.setDate(estimatedDate.getDate() + (avgDays * 7));
        }

        shippingOptions.push({
          partner: {
            _id: partner._id,
            name: partner.name,
            displayName: partner.displayName,
            code: partner.code,
            logo: partner.logo,
            rating: partner.rating,
            successRate: partner.successRate
          },
          cost: shippingCost,
          deliveryTime: deliveryTime,
          deliveryTimeDisplay: partner.deliveryTimeDisplay,
          isPopular: partner.isPopular,
          estimatedDelivery: estimatedDate.toISOString()
        });
      }

      // Sort by cost and popularity
      shippingOptions.sort((a, b) => {
        if (a.isPopular && !b.isPopular) return -1;
        if (!a.isPopular && b.isPopular) return 1;
        return a.cost - b.cost;
      });
    }

    res.json({
      success: true,
      message: 'Shipping charges calculated successfully',
      data: {
        shippingOptions
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to calculate shipping charges'
    });
  }
};

// Get tracking details (iThink Logistics integrated)
export const getTrackingDetails = async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }

    // First get our internal tracking details
    const trackingDetails = await logisticsService.getTrackingDetails(trackingNumber);

    // If we have an AWB number, get real-time tracking from iThink Logistics
    if (trackingDetails.tracking && trackingDetails.tracking.awbNumber) {
      try {
        const iThinkTracking = await logisticsService.getIThinkLogisticsTracking(trackingDetails.tracking.awbNumber);
        if (iThinkTracking.success) {
          // Merge iThink tracking data with our internal data
          trackingDetails.tracking.iThinkData = iThinkTracking.tracking;
          trackingDetails.tracking.isRealTime = true;
        }
      } catch (iThinkError) {
        trackingDetails.tracking.isRealTime = false;
      }
    }

    res.json({
      success: true,
      message: 'Tracking details retrieved successfully',
      data: {
        tracking: trackingDetails
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking details'
    });
  }
};


// Create shipment for an order
export const createShipment = async (req, res) => {
  try {
    const { orderId, partnerId, packageDetails } = req.body;

    if (!orderId || !partnerId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and partner ID are required'
      });
    }

    const shipment = await logisticsService.createShipment(orderId, partnerId, packageDetails);

    res.json({
      success: true,
      message: 'Shipment created successfully',
      data: {
        shipment
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create shipment'
    });
  }
};

// Update shipment status (for admin use)
export const updateShipmentStatus = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { status, location, description } = req.body;

    if (!trackingNumber || !status) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number and status are required'
      });
    }

    const deliveryTracking = await logisticsService.updateShipmentStatus(trackingNumber, status, location, description);

    res.json({
      success: true,
      message: 'Shipment status updated successfully',
      data: {
        deliveryTracking
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update shipment status'
    });
  }
};

// Process webhook from shipping partner
export const processWebhook = async (req, res) => {
  try {
    const { partnerCode } = req.params;
    const payload = req.body;
    const signature = req.headers['x-webhook-signature'];

    if (!partnerCode || !payload) {
      return res.status(400).json({
        success: false,
        message: 'Partner code and payload are required'
      });
    }

    const result = await logisticsService.processWebhook(partnerCode, payload, signature);

    res.json({
      success: true,
      message: 'Webhook processed successfully',
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook'
    });
  }
};

// Get delivery analytics
export const getDeliveryAnalytics = async (req, res) => {
  try {
    const { partnerId, startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate && endDate) {
      dateRange.start = startDate;
      dateRange.end = endDate;
    }

    const analytics = await logisticsService.getDeliveryAnalytics(partnerId, dateRange);

    res.json({
      success: true,
      message: 'Delivery analytics retrieved successfully',
      data: {
        analytics
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery analytics'
    });
  }
};

// Get active deliveries
export const getActiveDeliveries = async (req, res) => {
  try {
    const { partnerId } = req.query;

    const deliveries = await logisticsService.getActiveDeliveries(partnerId);

    res.json({
      success: true,
      message: 'Active deliveries retrieved successfully',
      data: {
        deliveries
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get active deliveries'
    });
  }
};

// Add note to delivery tracking
export const addDeliveryNote = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { note, addedBy } = req.body;

    if (!trackingNumber || !note || !addedBy) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number, note, and addedBy are required'
      });
    }

    const deliveryTracking = await DeliveryTracking.findOne({ trackingNumber });
    if (!deliveryTracking) {
      return res.status(404).json({
        success: false,
        message: 'Delivery tracking not found'
      });
    }

    await deliveryTracking.addNote(note, addedBy);

    res.json({
      success: true,
      message: 'Note added successfully',
      data: {
        deliveryTracking
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add delivery note'
    });
  }
};

// Get delivery timeline
export const getDeliveryTimeline = async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }

    const deliveryTracking = await DeliveryTracking.findOne({ trackingNumber })
      .populate('shippingPartner', 'name displayName trackingUrl')
      .populate('order', 'orderStatus total');

    if (!deliveryTracking) {
      return res.status(404).json({
        success: false,
        message: 'Delivery tracking not found'
      });
    }

    res.json({
      success: true,
      message: 'Delivery timeline retrieved successfully',
      data: {
        timeline: deliveryTracking.timeline,
        notes: deliveryTracking.notes,
        status: deliveryTracking.status,
        estimatedDelivery: deliveryTracking.estimatedDelivery,
        actualDelivery: deliveryTracking.actualDelivery,
        partner: deliveryTracking.shippingPartner,
        order: deliveryTracking.order,
        deliveryBoy: deliveryTracking.deliveryBoy,
        deliveryProof: deliveryTracking.deliveryProof
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery timeline'
    });
  }
};

// Assign delivery boy to shipment
export const assignDeliveryBoy = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { name, phone, id } = req.body;

    if (!trackingNumber || !name || !phone || !id) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number, name, phone, and id are required'
      });
    }

    const deliveryTracking = await logisticsService.assignDeliveryBoy(trackingNumber, {
      name,
      phone,
      id
    });

    res.json({
      success: true,
      message: 'Delivery boy assigned successfully',
      data: {
        deliveryTracking
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to assign delivery boy'
    });
  }
};

// Mark shipment as delivered
export const markAsDelivered = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { photo, signature } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }

    const deliveryTracking = await logisticsService.markAsDelivered(trackingNumber, {
      photo,
      signature
    });

    res.json({
      success: true,
      message: 'Shipment marked as delivered successfully',
      data: {
        deliveryTracking
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark as delivered'
    });
  }
};

// Get delivery boy dashboard
export const getDeliveryBoyDashboard = async (req, res) => {
  try {
    const { deliveryBoyId } = req.params;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: 'Delivery boy ID is required'
      });
    }

    const dashboardData = await logisticsService.getDeliveryBoyDashboard(deliveryBoyId);

    res.json({
      success: true,
      message: 'Delivery boy dashboard retrieved successfully',
      data: dashboardData
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery boy dashboard'
    });
  }
};

// Process delivery partner webhook
export const processDeliveryPartnerWebhook = async (req, res) => {
  try {
    const { partnerCode } = req.params;
    const payload = req.body;
    const signature = req.headers['x-webhook-signature'];

    if (!partnerCode || !payload) {
      return res.status(400).json({
        success: false,
        message: 'Partner code and payload are required'
      });
    }

    const result = await logisticsService.processDeliveryPartnerWebhook(partnerCode, payload, signature);

    res.json({
      success: true,
      message: 'Delivery partner webhook processed successfully',
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process delivery partner webhook'
    });
  }
};

// Sync order to iThink Logistics
export const syncOrderToIThinkLogistics = async (req, res) => {
  try {
    const { orderId, partnerId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    const result = await logisticsService.syncOrderToIThinkLogistics(orderId, partnerId);

    res.json({
      success: true,
      message: 'Order synced successfully to iThink Logistics',
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync order to iThink Logistics'
    });
  }
};

// Get iThink Logistics tracking details
export const getIThinkLogisticsTracking = async (req, res) => {
  try {
    const { awbNumber } = req.params;

    if (!awbNumber) {
      return res.status(400).json({
        success: false,
        message: 'AWB number is required'
      });
    }

    const result = await logisticsService.getIThinkLogisticsTracking(awbNumber);

    res.json({
      success: true,
      message: 'iThink Logistics tracking details retrieved successfully',
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get iThink Logistics tracking details'
    });
  }
};

// Handle iThink Logistics webhook for status updates
export const handleIThinkLogisticsWebhook = async (req, res) => {
  try {
    console.log('📡 Received iThink Logistics webhook:', req.body);
    
    const { awb_number, status, location, description, delivery_date, timestamp } = req.body;
    
    if (!awb_number) {
      return res.status(400).json({
        success: false,
        message: 'AWB number is required'
      });
    }

    // Find the order by AWB number
    const Order = (await import('../../models/order.js')).default;
    const order = await Order.findOne({ ithinkAwbNumber: awb_number });
    
    if (!order) {
      console.log('⚠️ Order not found for AWB:', awb_number);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order status based on iThink Logistics status
    const previousStatus = order.orderStatus;
    let orderStatus = order.orderStatus;
    if (status === 'delivered') {
      orderStatus = 'delivered';
      order.deliveredAt = new Date();
    } else if (status === 'in_transit' || status === 'out_for_delivery') {
      orderStatus = 'shipped';
    }

    // Update order
    await Order.findByIdAndUpdate(order._id, {
      orderStatus,
      deliveredAt: status === 'delivered' ? new Date() : order.deliveredAt
    });
    
    // Reload order with user populated for reward points
    const updatedOrder = await Order.findById(order._id).populate('user', 'email name');
    
    // Award reward points when order is delivered
    if (status === 'delivered' && previousStatus !== 'delivered' && updatedOrder) {
      try {
        // Import the helper function
        const { awardRewardPointsForOrder } = await import('./orderController.js');
        await awardRewardPointsForOrder(updatedOrder);
      } catch (rewardError) {
        console.error(`❌ Error awarding reward points for order ${order._id}:`, rewardError);
      }
    }

    // Update delivery tracking
    const deliveryTracking = await (await import('../../models/deliveryTracking.js')).default.findOne({ 
      order: order._id 
    });
    
    if (deliveryTracking) {
      await deliveryTracking.addTimelineEntry(
        status,
        location,
        description || `Status updated to: ${status}`,
        'ithink_logistics'
      );
    }

    // Send notification to customer
    try {
      const notificationService = (await import('../../services/notificationService.js')).default;
      await notificationService.sendOrderStatusNotifications(order, orderStatus, order.trackingNumber);
    } catch (notificationError) {
    }

    console.log('✅ iThink Logistics webhook processed successfully');
    
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process webhook'
    });
  }
};

// Check pincode availability with iThink Logistics (Enhanced with COD and delivery date)
export const checkPincodeAvailability = async (req, res) => {
  try {
    const { pincode } = req.params;
    const { weight = 1, orderValue = 0 } = req.query; // Optional weight and order value for delivery date

    if (!pincode) {
      return res.status(400).json({
        success: false,
        message: 'Pincode is required'
      });
    }

    // Check delivery availability
    const isAvailable = await logisticsService.checkIThinkPincodeAvailability(pincode);

    // Check COD availability from Settings
    const settings = await Settings.getSettings();
    const codSettings = settings?.codSettings || {};
    
    let isCodAvailable = false;
    if (codSettings.enableForAll) {
      isCodAvailable = true;
    } else if (codSettings.enabledPincodes && codSettings.enabledPincodes.includes(pincode)) {
      isCodAvailable = true;
    }

    // Calculate expected delivery date from iThink Logistics
    let expectedDeliveryDate = null;
    let expectedDeliveryDays = null;
    let shippingCharges = 0;

    if (isAvailable) {
      try {
        // Get delivery time and shipping charges from iThink Logistics
        const weight = parseFloat(req.query.weight) || 1;
        const orderValue = parseFloat(req.query.orderValue) || 0;
        
        // Get rates from iThink Logistics (includes delivery time)
        const rateInfo = await logisticsService.getIThinkShippingRates(pincode, weight, orderValue);
        
        if (rateInfo) {
          // Use iThink Logistics data
          expectedDeliveryDate = rateInfo.estimatedDelivery || null;
          expectedDeliveryDays = rateInfo.estimatedDeliveryDays || null;
          shippingCharges = rateInfo.shippingCharges || 0;
          
          console.log('✅ Delivery info from iThink Logistics:', {
            expectedDeliveryDate,
            expectedDeliveryDays,
            shippingCharges
          });
        } else {
          // Fallback: Default delivery time (3-5 days)
          const minDays = 3;
          const maxDays = 5;
          const avgDays = Math.ceil((minDays + maxDays) / 2);
          
          const deliveryDate = new Date();
          deliveryDate.setDate(deliveryDate.getDate() + avgDays);
          expectedDeliveryDate = deliveryDate.toISOString();
          expectedDeliveryDays = avgDays;
          shippingCharges = 0; // Free shipping
        }
      } catch (error) {
        // Fallback: Default delivery time (3-5 days)
        const minDays = 3;
        const maxDays = 5;
        const avgDays = Math.ceil((minDays + maxDays) / 2);
        
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + avgDays);
        expectedDeliveryDate = deliveryDate.toISOString();
        expectedDeliveryDays = avgDays;
        shippingCharges = 0;
      }
    }

    res.json({
      success: true,
      message: isAvailable 
        ? 'Pincode is serviceable' 
        : 'Pincode is not serviceable',
      data: {
        pincode,
        isAvailable,
        isCodAvailable,
        expectedDeliveryDate,
        expectedDeliveryDays,
        shippingCharges,
        message: isAvailable 
          ? 'We deliver to this pincode via iThink Logistics'
          : 'Sorry, we do not deliver to this pincode at the moment',
        codMessage: isCodAvailable
          ? 'Cash on Delivery is available for this pincode'
          : 'Cash on Delivery is not available for this pincode'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check pincode availability'
    });
  }
};

// Call iThink Logistics rate check API
export const callIThinkRateCheck = async (req, res) => {
  try {
    const { 
      from_pincode, 
      to_pincode, 
      shipping_length_cms, 
      shipping_width_cms, 
      shipping_height_cms, 
      shipping_weight_kg, 
      order_type = "Forward", 
      payment_method, 
      product_mrp 
    } = req.body;

    // Validate required fields
    if (!from_pincode || !to_pincode || !shipping_weight_kg || !payment_method || !product_mrp) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from_pincode, to_pincode, shipping_weight_kg, payment_method, product_mrp'
      });
    }

    // Validate dimensions
    if (shipping_length_cms && shipping_length_cms > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Length cannot be more than 1000cm'
      });
    }
    if (shipping_width_cms && shipping_width_cms > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Width cannot be more than 1000cm'
      });
    }
    if (shipping_height_cms && shipping_height_cms > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Height cannot be more than 1000cm'
      });
    }
    if (shipping_weight_kg > 10) {
      return res.status(400).json({
        success: false,
        message: 'Weight cannot be more than 10kg'
      });
    }

    // Prepare request data for iThink Logistics rate check API
    const rateCheckData = {
      from_pincode: 834003,
      to_pincode: parseInt(to_pincode),
      shipping_length_cms: shipping_length_cms || 20,
      shipping_width_cms: shipping_width_cms || 15,
      shipping_height_cms: shipping_height_cms || 10,
      shipping_weight_kg: shipping_weight_kg,
      order_type: order_type,
      payment_method: payment_method,
      product_mrp: parseFloat(product_mrp),
      access_token: process.env.ITHINK_ACCESS_TOKEN,
      secret_key: process.env.ITHINK_SECRET_KEY
    };

    console.log('🚚 Calling iThink Logistics rate check API:', {
      from_pincode: rateCheckData.from_pincode,
      to_pincode: rateCheckData.to_pincode,
      weight: rateCheckData.shipping_weight_kg,
      payment_method: rateCheckData.payment_method,
      order_type: rateCheckData.order_type,
      accessToken: process.env.ITHINK_ACCESS_TOKEN ? 'Present' : 'Missing'
    });

    // Call iThink Logistics rate check API
    const response = await axios.post(
      'https://my.ithinklogistics.com/api_v3/rate/check.json',
      {
        data: rateCheckData
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('💰 iThink Logistics rate check response:', response.data);

    if (response.data && response.data.status === 'success') {
      // Extract logistics options from response
      const logisticsOptions = response.data.data || [];
      
      // Map the response to our expected format
      const mappedLogisticsOptions = logisticsOptions.map(option => ({
        logistics: option.logistic_name,
        s_type: option.logistic_service_type,
        rate: option.rate,
        delivery_tat: option.delivery_tat,
        logistics_zone: option.logistics_zone,
        prepaid: option.prepaid,
        cod: option.cod,
        pickup: option.pickup,
        rev_pickup: option.rev_pickup,
        originalData: option // Keep original data for reference
      }));
      
      res.json({
        success: true,
        message: 'Rate check completed successfully',
        data: {
          logisticsOptions: mappedLogisticsOptions,
          rateCheckData,
          selectedLogistics: mappedLogisticsOptions.length > 0 ? mappedLogisticsOptions[0] : null
        }
      });
    } else {
      console.log({
        status: response.data?.status,
        message: response.data?.html_message || response.data?.message,
        fullResponse: response.data
      });
      
      res.status(400).json({
        success: false,
        message: response.data?.html_message || response.data?.message || 'Failed to get rate information',
        error: response.data
      });
    }

  } catch (error) {
    console.log({
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    
    res.status(500).json({
      success: false,
      message: error.response?.data?.html_message || error.response?.data?.message || error.message || 'Failed to check rates',
      error: error.response?.data || error.message
    });
  }
};

// Call iThink Logistics add.json API to get logistics options
export const callIThinkAddJson = async (req, res) => {
  try {
    const { orderId, shipmentDetails, selectedLogistics, isSelfLogistics, selfLogisticsId, selfLogisticsDetails } = req.body;

    if (!orderId || !shipmentDetails) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and shipment details are required'
      });
    }

    // Validate shipment details
    if (!shipmentDetails.length || !shipmentDetails.width || !shipmentDetails.height || !shipmentDetails.weight) {
      return res.status(400).json({
        success: false,
        message: 'All shipment dimensions and weight are required'
      });
    }

    // Get order details
    const order = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('items.product', 'productName price sku hsnCode taxRate imageUrl');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Handle self logistics - skip iThink API call
    if (isSelfLogistics) {
      // Validate self logistics details
      if (!selfLogisticsId || !selfLogisticsDetails) {
        return res.status(400).json({
          success: false,
          message: 'Self logistics ID and details are required'
        });
      }

      // Update order with self logistics details
      order.shipmentDetails = shipmentDetails;
      order.selfLogisticsId = selfLogisticsId;
      order.selfLogisticsDetails = {
        name: selfLogisticsDetails.name || '',
        email: selfLogisticsDetails.email || '',
        phone: selfLogisticsDetails.phone || '',
        address: selfLogisticsDetails.address || ''
      };
      order.logisticsType = 'self';
      order.orderStatus = 'confirmed'; // Confirm order when self logistics is used
      order.logisticsSynced = true;
      order.logisticsSyncedAt = new Date();
      await order.save();

      return res.json({
        success: true,
        message: 'Self logistics shipment created and order confirmed successfully',
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          shipmentDetails,
          selfLogisticsDetails: order.selfLogisticsDetails
        }
      });
    }

    // Prepare products array in iThink format
    const products = order.items.map(item => ({
      product_name: item.product.productName,
      product_sku: item.product.sku || `SKU-${item.product._id}`,
      product_quantity: item.quantity.toString(),
      product_price: item.product.price.toString(),
      product_tax_rate: item.product.taxRate ? item.product.taxRate.toString() : "18",
      product_hsn_code: item.product.hsnCode || "8517",
      product_discount: "0",
      product_img_url: item.product.imageUrl || ""
    }));

    // Prepare order data in exact iThink format
    const orderData = {
      data: {
        shipments: [{
          order: order._id.toString(),
          order_date: order.createdAt.toISOString().split('T')[0].split('-').reverse().join('-'), // DD-MM-YYYY format
          total_amount: order.total.toString(),
          name: order.address.name,
          company_name: "",
          add: order.address.addressLine1,
          pin: order.address.pincode,
          city: order.address.city,
          state: order.address.state,
          country: "India",
          phone: order.address.mobile,
          alt_phone: order.address.mobile,
          email: order.user.email || "",
          is_billing_same_as_shipping: "yes",
          billing_name: order.address.name,
          billing_company_name: "",
          billing_add: order.address.addressLine1,
          billing_pin: order.address.pincode,
          billing_city: order.address.city,
          billing_state: order.address.state,
          billing_country: "India",
          billing_phone: order.address.mobile,
          billing_alt_phone: order.address.mobile,
          billing_email: order.user.email || "",
          products: products,
          shipment_length: shipmentDetails.length.toString(),
          shipment_width: shipmentDetails.width.toString(),
          shipment_height: shipmentDetails.height.toString(),
          weight: shipmentDetails.weight.toString(),
          shipping_charges: order.shippingCharges ? order.shippingCharges.toString() : "0",
          cod_charges: "0",
          advance_amount: "0",
          cod_amount: order.paymentMethod === 'cod' ? order.total.toString() : "0",
          payment_mode: order.paymentMethod === 'cod' ? "COD" : "Prepaid",
          return_address_id: "89158",
          store_id: process.env.ITHINK_STORE_ID
        }],
        pickup_address_id: "89158",
        access_token: process.env.ITHINK_ACCESS_TOKEN,
        secret_key: process.env.ITHINK_SECRET_KEY || "",
        order_type: "Forward",
        s_type: selectedLogistics?.s_type || "",
        logistics: selectedLogistics?.logistics || ""

      }
    };

    console.log('🚚 Calling iThink Logistics add.json API:', {
      orderId: order._id,
      shipmentDetails,
      accessToken: process.env.ITHINK_ACCESS_TOKEN ? 'Present' : 'Missing',
      accessTokenLength: process.env.ITHINK_ACCESS_TOKEN?.length,
      orderDataKeys: Object.keys(orderData.data.shipments[0]).length
    });
    
    console.log('📦 Order Data being sent:', JSON.stringify(orderData, null, 2));

    // Call iThink Logistics add.json API
    const response = await axios.post(
      'https://my.ithinklogistics.com/api_v3/order/add.json',
      orderData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log('📦 iThink Logistics add.json response:', response.data);

    if (response.data.status === 'success') {
      res.json({
        success: true,
        message: 'Logistics options retrieved successfully',
        data: response.data
      });
    } else {
      console.log({
        status: response.data.status,
        message: response.data.html_message,
        fullResponse: response.data
      });
      
      res.status(400).json({
        success: false,
        message: response.data.html_message || response.data.message || 'Failed to get logistics options',
        error: response.data
      });
    }

  } catch (error) {
    console.log({
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    
    res.status(500).json({
      success: false,
      message: error.response?.data?.html_message || error.response?.data?.message || error.message || 'Failed to get logistics options',
      error: error.response?.data || error.message
    });
  }
};

// Cancel order with iThink Logistics
export const cancelOrderWithIThinkLogistics = async (req, res) => {
  try {
    const { orderId, awbNumbers } = req.body;

    if (!orderId || !awbNumbers) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and AWB numbers are required'
      });
    }

    // Validate iThink Logistics environment variables
    const requiredEnvVars = {
      ITHINK_ACCESS_TOKEN: process.env.ITHINK_ACCESS_TOKEN,
      ITHINK_SECRET_KEY: process.env.ITHINK_SECRET_KEY
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value || value === 'your_ithink_access_token_here' || value === 'your_ithink_secret_key_here')
      .map(([key]) => key);

    if (missingVars.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing or invalid iThink Logistics environment variables: ${missingVars.join(', ')}. Please check your .env file and ensure all iThink Logistics credentials are properly configured.`
      });
    }

    // Prepare cancel data for iThink Logistics API
    const cancelData = {
      data: {
        access_token: process.env.ITHINK_ACCESS_TOKEN,
        secret_key: process.env.ITHINK_SECRET_KEY,
        awb_numbers: awbNumbers
      }
    };

    console.log('🚫 Cancelling order with iThink Logistics:', {
      orderId,
      awbNumbers,
      productionUrl: 'https://my.ithinklogistics.com/api_v3/order/cancel.json'
    });

    console.log('📦 Cancel data being sent to iThink cancel.json:', JSON.stringify(cancelData, null, 2));

    // Call iThink Logistics cancel.json API
    const response = await axios.post(
      'https://my.ithinklogistics.com/api_v3/order/cancel.json',
      cancelData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    console.log('✅ iThink Logistics cancel response:', response.data);

    // Check if the response indicates success
    if (response.data && response.data.status === 'success') {
      res.json({
        success: true,
        message: 'Order cancelled successfully with iThink Logistics',
        data: response.data
      });
    } else {
      // Handle different error formats from iThink Logistics cancel.json API
      const errorMessage = response.data?.html_message || 
                         response.data?.message || 
                         response.data?.error ||
                         'Unknown error from iThink Logistics cancel.json API';
      
      console.log({
        status: response.data?.status,
        status_code: response.data?.status_code,
        message: errorMessage,
        fullResponse: response.data
      });
      
      res.status(400).json({
        success: false,
        message: `iThink Logistics cancel failed: ${errorMessage}`,
        error: response.data
      });
    }

  } catch (error) {
    console.log({
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    
    res.status(500).json({
      success: false,
      message: error.response?.data?.html_message || error.response?.data?.message || error.message || 'Failed to cancel order with iThink Logistics',
      error: error.response?.data || error.message
    });
  }
};

// Track order with iThink Logistics
export const trackOrderWithIThinkLogistics = async (req, res) => {
  try {
    const { awbNumbers } = req.body;

    if (!awbNumbers) {
      return res.status(400).json({
        success: false,
        message: 'AWB numbers are required'
      });
    }

    // Validate iThink Logistics environment variables
    const requiredEnvVars = {
      ITHINK_ACCESS_TOKEN: process.env.ITHINK_ACCESS_TOKEN,
      ITHINK_SECRET_KEY: process.env.ITHINK_SECRET_KEY
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value || value === 'your_ithink_access_token_here' || value === 'your_ithink_secret_key_here')
      .map(([key]) => key);

    if (missingVars.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing or invalid iThink Logistics environment variables: ${missingVars.join(', ')}. Please check your .env file and ensure all iThink Logistics credentials are properly configured.`
      });
    }

    // Prepare track data for iThink Logistics API
    const trackData = {
      data: {
        awb_number_list: awbNumbers,
        access_token: process.env.ITHINK_ACCESS_TOKEN,
        secret_key: process.env.ITHINK_SECRET_KEY
      }
    };

    console.log('📦 Tracking order with iThink Logistics:', {
      awbNumbers,
      productionUrl: 'https://api.ithinklogistics.com/api_v3/order/track.json'
    });

    console.log('📦 Track data being sent to iThink track.json:', JSON.stringify(trackData, null, 2));

    // Call iThink Logistics track.json API
    const response = await axios.post(
      'https://api.ithinklogistics.com/api_v3/order/track.json',
      trackData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      }
    );

    console.log('✅ iThink Logistics track response:', response.data);

    // Check if the response indicates success
    if (response.data && response.data.status === 'success') {
      // Process tracking data and update order statuses
      const trackingResults = await processTrackingData(response.data.data);
      
      res.json({
        success: true,
        message: 'Order tracking completed successfully',
        data: {
          trackingData: response.data.data,
          updatedOrders: trackingResults
        }
      });
    } else {
      // Handle different error formats from iThink Logistics track.json API
      const errorMessage = response.data?.html_message || 
                         response.data?.message || 
                         response.data?.error ||
                         'Unknown error from iThink Logistics track.json API';
      
      console.log({
        status: response.data?.status,
        status_code: response.data?.status_code,
        message: errorMessage,
        fullResponse: response.data
      });
      
      res.status(400).json({
        success: false,
        message: `iThink Logistics tracking failed: ${errorMessage}`,
        error: response.data
      });
    }

  } catch (error) {
    console.log({
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    });
    
    res.status(500).json({
      success: false,
      message: error.response?.data?.html_message || error.response?.data?.message || error.message || 'Failed to track order with iThink Logistics',
      error: error.response?.data || error.message
    });
  }
};

// Process tracking data and update order statuses
const processTrackingData = async (trackingData) => {
  const updatedOrders = [];
  
  try {
    const Order = (await import('../../models/order.js')).default;
    
    // Process each AWB number in the tracking data
    for (const [awbNumber, trackingInfo] of Object.entries(trackingData)) {
      if (trackingInfo && trackingInfo.status) {
        console.log(`📦 Processing tracking for AWB: ${awbNumber}, Status: ${trackingInfo.status}`);
        
        // Find order by AWB number
        const order = await Order.findOne({ ithinkAwbNumber: awbNumber });
        
        if (order) {
          let newOrderStatus = order.orderStatus;
          let deliveredAt = order.deliveredAt;
          
          // Map iThink Logistics status to our order status
          switch (trackingInfo.status.toLowerCase()) {
            case 'delivered':
              newOrderStatus = 'delivered';
              deliveredAt = new Date();
              break;
            case 'out_for_delivery':
            case 'in_transit':
              newOrderStatus = 'shipped';
              break;
            case 'picked_up':
            case 'dispatched':
              newOrderStatus = 'shipped';
              break;
            default:
              // Keep current status for other statuses
              break;
          }
          
          // Update order if status changed
          if (newOrderStatus !== order.orderStatus) {
            await Order.findByIdAndUpdate(order._id, {
              orderStatus: newOrderStatus,
              deliveredAt: deliveredAt
            });
            
            console.log(`✅ Updated order ${order._id} status from ${order.orderStatus} to ${newOrderStatus}`);
            
            updatedOrders.push({
              orderId: order._id,
              awbNumber: awbNumber,
              oldStatus: order.orderStatus,
              newStatus: newOrderStatus,
              trackingInfo: trackingInfo
            });
            
            // Send notification to customer
            try {
              const notificationService = (await import('../../services/notificationService.js')).default;
              await notificationService.sendOrderStatusNotifications(order, newOrderStatus, order.trackingNumber);
            } catch (notificationError) {
            }
          }
        } else {
          console.log(`⚠️ Order not found for AWB: ${awbNumber}`);
        }
      }
    }
    
    return updatedOrders;
  } catch (error) {
    throw error;
  }
};

// Auto-track orders with iThink Logistics
export const autoTrackOrders = async (req, res) => {
  try {
    const logisticsService = (await import('../../services/logisticsService.js')).default;
    const result = await logisticsService.autoTrackOrders();
    
    res.json({
      success: result.success,
      message: result.message,
      data: {
        updatedOrders: result.updatedOrders || [],
        error: result.error || null
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Auto-tracking failed',
      error: error.message
    });
  }
}; 