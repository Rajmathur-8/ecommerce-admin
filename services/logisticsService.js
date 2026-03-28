import axios from 'axios';
import DeliveryTracking from '../models/deliveryTracking.js';
import Order from '../models/order.js';
import notificationService from './notificationService.js';
import realTimeTrackingService from './realTimeTrackingService.js';

class LogisticsService {
  constructor() {
    this.webhookSecret = process.env.LOGISTICS_WEBHOOK_SECRET;
  }

  // Generate tracking number
  generateTrackingNumber(partnerCode, orderId) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `${partnerCode}${timestamp}${random}`;
  }

  // Calculate shipping charges using iThink Logistics
  async calculateShippingCharges(orderId, pincode, weight = 0) {
    try {
      const order = await Order.findById(orderId).populate('items.product');
      if (!order) {
        throw new Error('Order not found');
      }

      // Check pincode availability with iThink Logistics
      const isPincodeAvailable = await this.checkIThinkPincodeAvailability(pincode);
      
      if (!isPincodeAvailable) {
        return []; // No shipping options available
      }

      // Get iThink Logistics partner
      const iThinkPartner = await ShippingPartner.findOne({
        code: 'ithink',
        isActive: true,
        status: 'active'
      });

      if (!iThinkPartner) {
        throw new Error('iThink Logistics partner not configured');
      }

      // Calculate shipping cost and delivery time using iThink Logistics rates
      const rateInfo = await this.getIThinkShippingRates(pincode, weight, order.total);
      
      // Use delivery time from iThink if available, otherwise use partner default
      let estimatedDelivery = this.calculateEstimatedDelivery(iThinkPartner.deliveryTime);
      let deliveryTime = iThinkPartner.deliveryTime;
      let shippingCost = 0;
      
      if (rateInfo && typeof rateInfo === 'object' && rateInfo.shippingCharges !== undefined) {
        shippingCost = rateInfo.shippingCharges || 0;
        
        if (rateInfo.estimatedDelivery) {
          estimatedDelivery = new Date(rateInfo.estimatedDelivery);
          // Update delivery time based on iThink response
          if (rateInfo.estimatedDeliveryDays) {
            const days = rateInfo.estimatedDeliveryDays;
            deliveryTime = {
              min: Math.max(1, days - 1),
              max: days + 1,
              unit: 'days'
            };
          }
        }
      } else if (typeof rateInfo === 'number') {
        // Backward compatibility: if it returns just a number
        shippingCost = rateInfo;
      }

      const shippingOptions = [{
        partner: {
          _id: iThinkPartner._id,
          name: iThinkPartner.name,
          displayName: iThinkPartner.displayName,
          code: iThinkPartner.code,
          logo: iThinkPartner.logo,
          rating: iThinkPartner.rating,
          successRate: iThinkPartner.successRate
        },
        cost: shippingCost,
        deliveryTime: deliveryTime,
        deliveryTimeDisplay: iThinkPartner.deliveryTimeDisplay,
        isPopular: true, // iThink is always popular
        estimatedDelivery: estimatedDelivery.toISOString(),
        isIThink: true // Flag to identify iThink partner
      }];

      return shippingOptions;
    } catch (error) {
      throw error;
    }
  }

  // Calculate estimated delivery date
  calculateEstimatedDelivery(deliveryTime) {
    const { min, max, unit } = deliveryTime;
    const avgDays = (min + max) / 2;
    
    const estimatedDate = new Date();
    if (unit === 'days') {
      estimatedDate.setDate(estimatedDate.getDate() + avgDays);
    } else if (unit === 'weeks') {
      estimatedDate.setDate(estimatedDate.getDate() + (avgDays * 7));
    }
    
    return estimatedDate;
  }

  // Create shipment
  async createShipment(orderId, partnerId, packageDetails = {}) {
    try {
      const order = await Order.findById(orderId).populate('items.product');
      
      // Handle both ObjectId and partner code
      let partner;
      if (partnerId.match(/^[0-9a-fA-F]{24}$/)) {
        // It's an ObjectId
        partner = await ShippingPartner.findById(partnerId);
      } else {
        // It's a partner code
        partner = await ShippingPartner.findOne({ code: partnerId.toLowerCase() });
      }
      
      if (!order || !partner) {
        throw new Error('Order or shipping partner not found');
      }

      // Generate tracking number
      const trackingNumber = this.generateTrackingNumber(partner.code, orderId);
      
      // Calculate estimated delivery
      const estimatedDelivery = this.calculateEstimatedDelivery(partner.deliveryTime);

      // Calculate package weight from products if not provided
      let packageWeight = packageDetails.weight || 0;
      if (packageWeight === 0 && order.items && order.items.length > 0) {
        // Estimate weight based on product count (average 0.5kg per item)
        packageWeight = order.items.reduce((total, item) => total + (item.quantity * 0.5), 0);
      }

      // Create delivery tracking record
      const deliveryTracking = new DeliveryTracking({
        order: orderId,
        shippingPartner: partnerId,
        trackingNumber,
        status: 'order_placed',
        estimatedDelivery,
        packageDetails: {
          weight: packageWeight,
          dimensions: packageDetails.dimensions || { length: 20, width: 15, height: 10, unit: 'cm' },
          declaredValue: order.total
        },
        recipientDetails: {
          name: order.address.name,
          mobile: order.address.mobile,
          address: `${order.address.addressLine1}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}`,
          pincode: order.address.pincode
        },
        timeline: [{
          status: 'order_placed',
          description: 'Order placed - Shipment created and ready for pickup',
          updatedBy: 'system'
        }]
      });

      await deliveryTracking.save();

      // Update order with tracking number
      order.trackingNumber = trackingNumber;
      order.estimatedDelivery = estimatedDelivery;
      // Keep order status as 'pending' - it will be updated to 'confirmed' when payment is processed
      await order.save();

      // Schedule automatic status progression
      this.scheduleStatusProgression(deliveryTracking._id, trackingNumber);

      // Send notification
      try {
        await notificationService.sendOrderStatusNotifications(order, 'confirmed', trackingNumber);
      } catch (notificationError) {
      }

      // Broadcast real-time update
      try {
        await realTimeTrackingService.broadcastStatusUpdate(
          trackingNumber, 
          'order_placed', 
          'Shipment created and ready for pickup'
        );
      } catch (realtimeError) {
      }

      return {
        trackingNumber,
        estimatedDelivery,
        partner: {
          name: partner.name,
          displayName: partner.displayName,
          trackingUrl: partner.trackingUrl
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Update shipment status
  async updateShipmentStatus(trackingNumber, status, location = null, description = null) {
    try {
      const deliveryTracking = await DeliveryTracking.findOne({ trackingNumber });
      if (!deliveryTracking) {
        throw new Error('Shipment not found');
      }

      // Add timeline entry
      await deliveryTracking.addTimelineEntry(status, location, description);

      // Update order status if needed
      const order = await Order.findById(deliveryTracking.order).populate('user', 'email name');
      if (order) {
        const previousStatus = order.orderStatus;
        if (status === 'delivered') {
          order.orderStatus = 'delivered';
          deliveryTracking.actualDelivery = new Date();
        } else if (status === 'picked_up') {
          order.orderStatus = 'shipped';
        }
        await order.save();
        
        // Award reward points when order is delivered
        if (status === 'delivered' && previousStatus !== 'delivered') {
          try {
            const { awardRewardPointsForOrder } = await import('../controllers/web/orderController.js');
            await awardRewardPointsForOrder(order);
          } catch (rewardError) {
            console.error(`❌ Error awarding reward points for order ${order._id}:`, rewardError);
          }
        }

        // Send notification
        try {
          await notificationService.sendOrderStatusNotifications(order, order.orderStatus, trackingNumber);
        } catch (notificationError) {
        }
      }

      // Broadcast real-time update
      try {
        await realTimeTrackingService.broadcastStatusUpdate(
          trackingNumber, 
          status, 
          description || `Status updated to: ${status}`
        );
      } catch (realtimeError) {
      }

      return deliveryTracking;
    } catch (error) {
      throw error;
    }
  }

  // Get tracking details
  async getTrackingDetails(trackingNumber) {
    try {
      const deliveryTracking = await DeliveryTracking.findByTrackingNumber(trackingNumber);
      if (!deliveryTracking) {
        throw new Error('Tracking number not found');
      }

      return {
        trackingNumber: deliveryTracking.trackingNumber,
        status: deliveryTracking.status,
        statusDisplay: deliveryTracking.statusDisplay,
        progressPercentage: deliveryTracking.progressPercentage,
        estimatedDelivery: deliveryTracking.estimatedDelivery,
        actualDelivery: deliveryTracking.actualDelivery,
        currentLocation: deliveryTracking.currentLocation,
        timeline: deliveryTracking.timeline,
        partner: {
          name: deliveryTracking.shippingPartner.name,
          displayName: deliveryTracking.shippingPartner.displayName,
          trackingUrl: deliveryTracking.shippingPartner.trackingUrl
        },
        order: {
          id: deliveryTracking.order._id,
          status: deliveryTracking.order.orderStatus,
          total: deliveryTracking.order.total
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Process webhook from shipping partner
  async processWebhook(partnerCode, payload, signature) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const { tracking_number, status, location, description, timestamp } = payload;
      
      // Update shipment status
      await this.updateShipmentStatus(tracking_number, status, location, description);
      
      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload, signature) {
    // Implement signature verification based on partner
    // This is a simplified version
    return true;
  }

  // Get delivery analytics
  async getDeliveryAnalytics(partnerId = null, dateRange = {}) {
    try {
      const matchStage = { isActive: true };
      
      if (partnerId) {
        matchStage.shippingPartner = partnerId;
      }
      
      if (dateRange.start && dateRange.end) {
        matchStage.createdAt = {
          $gte: new Date(dateRange.start),
          $lte: new Date(dateRange.end)
        };
      }

      const analytics = await DeliveryTracking.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: '$packageDetails.declaredValue' }
          }
        }
      ]);

      const totalDeliveries = analytics.reduce((sum, item) => sum + item.count, 0);
      const deliveredCount = analytics.find(item => item._id === 'delivered')?.count || 0;
      const successRate = totalDeliveries > 0 ? (deliveredCount / totalDeliveries) * 100 : 0;

      return {
        totalDeliveries,
        deliveredCount,
        successRate: Math.round(successRate * 100) / 100,
        statusBreakdown: analytics,
        averageDeliveryTime: await this.calculateAverageDeliveryTime(matchStage)
      };
    } catch (error) {
      throw error;
    }
  }

  // Calculate average delivery time
  async calculateAverageDeliveryTime(matchStage) {
    try {
      const result = await DeliveryTracking.aggregate([
        { $match: { ...matchStage, actualDelivery: { $exists: true } } },
        {
          $project: {
            deliveryTime: {
              $divide: [
                { $subtract: ['$actualDelivery', '$createdAt'] },
                1000 * 60 * 60 * 24 // Convert to days
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            averageDays: { $avg: '$deliveryTime' }
          }
        }
      ]);

      return result.length > 0 ? Math.round(result[0].averageDays * 100) / 100 : 0;
    } catch (error) {
      return 0;
    }
  }

  // Get active deliveries
  async getActiveDeliveries(partnerId = null) {
    try {
      const matchStage = {
        isActive: true,
        status: { $nin: ['delivered', 'cancelled', 'returned'] }
      };

      if (partnerId) {
        matchStage.shippingPartner = partnerId;
      }

      return await DeliveryTracking.find(matchStage)
        .populate('order', 'orderStatus total items')
        .populate('shippingPartner', 'name displayName')
        .sort({ estimatedDelivery: 1 });
    } catch (error) {
      throw error;
    }
  }

  // Schedule automatic status progression
  scheduleStatusProgression(deliveryTrackingId, trackingNumber) {
    // Schedule pickup after 2 hours
    setTimeout(async () => {
      try {
        await this.updateShipmentStatus(trackingNumber, 'pickup_scheduled', null, 'Pickup scheduled - Delivery partner will collect the package');
      } catch (error) {
      }
    }, 2 * 60 * 60 * 1000); // 2 hours

    // Schedule picked up after 4 hours
    setTimeout(async () => {
      try {
        await this.updateShipmentStatus(trackingNumber, 'picked_up', null, 'Package picked up from warehouse');
      } catch (error) {
      }
    }, 4 * 60 * 60 * 1000); // 4 hours

    // Schedule in transit after 6 hours
    setTimeout(async () => {
      try {
        await this.updateShipmentStatus(trackingNumber, 'in_transit', null, 'Package is in transit to destination');
      } catch (error) {
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Schedule out for delivery after 12 hours
    setTimeout(async () => {
      try {
        await this.updateShipmentStatus(trackingNumber, 'out_for_delivery', null, 'Package is out for delivery');
      } catch (error) {
      }
    }, 12 * 60 * 60 * 1000); // 12 hours
  }

  // Assign delivery boy to shipment
  async assignDeliveryBoy(trackingNumber, deliveryBoyDetails) {
    try {
      const deliveryTracking = await DeliveryTracking.findOne({ trackingNumber });
      if (!deliveryTracking) {
        throw new Error('Shipment not found');
      }

      deliveryTracking.deliveryBoy = {
        name: deliveryBoyDetails.name,
        phone: deliveryBoyDetails.phone,
        id: deliveryBoyDetails.id,
        assignedAt: new Date()
      };

      await deliveryTracking.addTimelineEntry(
        'out_for_delivery',
        null,
        `Delivery boy assigned: ${deliveryBoyDetails.name} (${deliveryBoyDetails.phone})`,
        'admin'
      );

      await deliveryTracking.save();

      // Update order status
      const order = await Order.findById(deliveryTracking.order);
      if (order) {
        order.orderStatus = 'shipped';
        await order.save();
      }

      return deliveryTracking;
    } catch (error) {
      throw error;
    }
  }

  // Mark as delivered with proof
  async markAsDelivered(trackingNumber, deliveryProof = {}) {
    try {
      const deliveryTracking = await DeliveryTracking.findOne({ trackingNumber });
      if (!deliveryTracking) {
        throw new Error('Shipment not found');
      }

      // Update delivery tracking
      deliveryTracking.status = 'delivered';
      deliveryTracking.actualDelivery = new Date();
      deliveryTracking.deliveryProof = {
        photo: deliveryProof.photo || null,
        signature: deliveryProof.signature || null,
        timestamp: new Date()
      };

      await deliveryTracking.addTimelineEntry(
        'delivered',
        null,
        'Package delivered successfully',
        'delivery_boy'
      );

      await deliveryTracking.save();

      // Update order status
      const order = await Order.findById(deliveryTracking.order).populate('user', 'email name');
      if (order) {
        const previousStatus = order.orderStatus;
        order.orderStatus = 'delivered';
        order.deliveredAt = new Date();
        await order.save();
        
        // Award reward points when order is delivered
        if (previousStatus !== 'delivered') {
          try {
            const { awardRewardPointsForOrder } = await import('../controllers/web/orderController.js');
            await awardRewardPointsForOrder(order);
          } catch (rewardError) {
            console.error(`❌ Error awarding reward points for order ${order._id}:`, rewardError);
          }
        }

        // Send delivery notification
        try {
          await notificationService.sendOrderStatusNotifications(order, 'delivered', trackingNumber);
        } catch (notificationError) {
        }
      }

      return deliveryTracking;
    } catch (error) {
      throw error;
    }
  }

  // Get delivery boy dashboard data
  async getDeliveryBoyDashboard(deliveryBoyId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const deliveries = await DeliveryTracking.find({
        'deliveryBoy.id': deliveryBoyId,
        status: { $in: ['out_for_delivery', 'delivered'] },
        createdAt: { $gte: today, $lt: tomorrow }
      })
      .populate('order', 'orderStatus total')
      .populate('shippingPartner', 'name displayName')
      .sort({ estimatedDelivery: 1 });

      const stats = {
        totalAssigned: deliveries.length,
        delivered: deliveries.filter(d => d.status === 'delivered').length,
        pending: deliveries.filter(d => d.status === 'out_for_delivery').length
      };

      return {
        deliveries,
        stats
      };
    } catch (error) {
      throw error;
    }
  }

  // Process delivery partner webhook
  async processDeliveryPartnerWebhook(partnerCode, payload, signature) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const { tracking_number, status, location, description, delivery_boy, timestamp } = payload;
      
      // Update shipment status
      const deliveryTracking = await this.updateShipmentStatus(tracking_number, status, location, description);
      
      // If delivery boy information is provided, assign them
      if (delivery_boy && status === 'out_for_delivery') {
        await this.assignDeliveryBoy(tracking_number, delivery_boy);
      }

      // If delivered, mark as delivered
      if (status === 'delivered') {
        await this.markAsDelivered(tracking_number, {
          photo: payload.delivery_photo || null,
          signature: payload.signature || null
        });
      }
      
      return { success: true, deliveryTracking };
    } catch (error) {
      throw error;
    }
  }

  // iThink Logistics Integration
  async syncOrderToIThinkLogistics(orderId, partnerId = null) {
    try {
      const order = await Order.findById(orderId).populate('items.product');
      
      // Get iThink Logistics partner (dynamic)
      let partner;
      if (partnerId) {
        // Handle both ObjectId and partner code if provided
        if (partnerId.match(/^[0-9a-fA-F]{24}$/)) {
          // It's an ObjectId
          partner = await ShippingPartner.findById(partnerId);
        } else {
          // It's a partner code
          partner = await ShippingPartner.findOne({ code: partnerId.toLowerCase() });
        }
      } else {
        // Auto-find iThink Logistics partner
        partner = await ShippingPartner.findOne({ code: 'ithink' });
      }
      
      if (!order || !partner) {
        throw new Error('Order or iThink Logistics partner not found');
      }

      // Check if this is iThink Logistics partner
      if (partner.code.toLowerCase() !== 'ithink') {
        throw new Error('This is not an iThink Logistics partner');
      }

      // Validate iThink Logistics environment variables
      const requiredEnvVars = {
        ITHINK_ACCESS_TOKEN: process.env.ITHINK_ACCESS_TOKEN,
        ITHINK_SECRET_KEY: process.env.ITHINK_SECRET_KEY,
        ITHINK_PICKUP_ADDRESS_ID:"89158"
      };

      const missingVars = Object.entries(requiredEnvVars)
        .filter(([key, value]) => !value || value === 'your_ithink_access_token_here' || value === 'your_ithink_secret_key_here' || value === 'your_ithink_pickup_address_id_here')
        .map(([key]) => key);

      if (missingVars.length > 0) {
        throw new Error(`Missing or invalid iThink Logistics environment variables: ${missingVars.join(', ')}. Please check your .env file and ensure all iThink Logistics credentials are properly configured.`);
      }

      // Prepare order data for iThink Logistics sync.json API
      const orderData = {
        data: {
          shipments: [{
            order: order._id.toString(),
            sub_order: "",
            order_date: order.createdAt.toISOString().replace('T', ' ').substring(0, 19),
            total_amount: order.total.toString(),
            name: order.address.name,
            company_name: "",
            add: order.address.addressLine1,
            add2: order.address.addressLine2 || "",
            add3: "",
            pin: order.address.pincode,
            city: order.address.city,
            state: order.address.state,
            country: "India",
            phone: order.address.mobile,
            alt_phone: order.address.mobile,
            email: order.user?.email || "",
            is_billing_same_as_shipping: "yes",
            billing_name: order.address.name,
            billing_company_name: "",
            billing_add: order.address.addressLine1,
            billing_add2: order.address.addressLine2 || "",
            billing_add3: "",
            billing_pin: order.address.pincode,
            billing_city: order.address.city,
            billing_state: order.address.state,
            billing_country: "India",
            billing_phone: order.address.mobile,
            billing_alt_phone: order.address.mobile,
            billing_email: order.user?.email || "",
            products: order.items.map(item => ({
              product_name: item.product.productName,
              product_sku: item.product.sku || `SKU-${item.product._id.toString().slice(-8)}`,
              product_quantity: item.quantity.toString(),
              product_price: item.price.toString(),
              product_tax_rate: item.product.taxRate ? item.product.taxRate.toString() : "18",
              product_hsn_code: item.product.hsnCode || "8517",
              product_discount: "0"
            })),
            shipment_length: order.shipmentDetails?.length?.toString() || "10", // in cm
            shipment_width: order.shipmentDetails?.width?.toString() || "10", // in cm
            shipment_height: order.shipmentDetails?.height?.toString() || "5", // in cm
            weight: order.shipmentDetails?.weight?.toString() || this.calculateOrderWeight(order.items).toString(), // in Kg
            shipping_charges: order.shippingCharges ? order.shippingCharges.toString() : "0",
            giftwrap_charges: "0",
            transaction_charges: "0",
            total_discount: order.discountAmount ? order.discountAmount.toString() : "0",
            first_attemp_discount: "0",
            cod_charges: "0",
            advance_amount: "0",
            cod_amount: order.paymentMethod === 'cod' ? "0" : "0",
            payment_mode: order.paymentMethod === 'cod' ? "COD" : "Prepaid",
            return_address_id: "89158",
            reseller_name: "",
            eway_bill_number: "",
            gst_number: ""
          }],
          pickup_address_id:  "89158",
          access_token: process.env.ITHINK_ACCESS_TOKEN,
          secret_key: process.env.ITHINK_SECRET_KEY
        }
      };

      console.log('🚚 Syncing order to iThink Logistics:', {
        orderId: order._id,
        partner: partner.displayName,
        productionUrl: 'https://my.ithinklogistics.com/api_v3/order/sync.json',
        shipmentDetails: order.shipmentDetails
      });

      console.log('📦 Order data being sent to iThink sync.json:', JSON.stringify(orderData, null, 2));

      // Call iThink Logistics sync.json API
      const response = await axios.post(
        'https://my.ithinklogistics.com/api_v3/order/sync.json',
        orderData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000 // 30 seconds timeout
        }
      );

      console.log('✅ iThink Logistics sync response:', response.data);

      // Check if the response indicates success
      if (response.data && response.data.status === 'success') {
        // Update delivery tracking with iThink Logistics AWB number
        const deliveryTracking = await DeliveryTracking.findOne({ order: orderId });
        if (deliveryTracking && response.data.data && response.data.data.awb_number) {
          deliveryTracking.awbNumber = response.data.data.awb_number;
          await deliveryTracking.save();
          
          console.log('📦 AWB number updated:', response.data.data.awb_number);
        }

        // Try to get delivery date and tracking details immediately after sync
        let deliveryDetails = null;
        if (response.data.data?.awb_number) {
          try {
            console.log('🔍 Fetching delivery details for AWB:', response.data.data.awb_number);
            const trackingResult = await this.getIThinkLogisticsTracking(response.data.data.awb_number);
            if (trackingResult.success && trackingResult.tracking) {
              deliveryDetails = trackingResult.tracking;
              console.log('✅ Delivery details fetched:', deliveryDetails);
            }
          } catch (trackingError) {
            // This is not critical, details can be fetched later
          }
        }

        // Auto-track the order after successful sync
        try {
          console.log('🔄 Auto-tracking order after sync...');
          const trackResult = await this.autoTrackSingleOrder(response.data.data?.awb_number);
          console.log('✅ Auto-tracking result:', trackResult);
        } catch (trackError) {
          // Don't fail the sync if tracking fails
        }

        return {
          success: true,
          awbNumber: response.data.data?.awb_number,
          trackingNumber: response.data.data?.tracking_number,
          deliveryDetails: deliveryDetails,
          message: 'Order synced successfully to iThink Logistics'
        };
      } else {
        // Handle different error formats from iThink Logistics
        const errorMessage = response.data?.html_message || 
                           response.data?.message || 
                           response.data?.error || 
                           'Failed to sync order to iThink Logistics';
        
        console.log({
          status: response.data?.status,
          status_code: response.data?.status_code,
          message: errorMessage,
          full_response: response.data
        });
        
        throw new Error(`iThink Logistics API Error: ${errorMessage}`);
      }

    } catch (error) {
      
      if (error.response) {
        console.log({
          status: error.response.status,
          data: error.response.data
        });
      }
      
      throw new Error(`iThink Logistics sync failed: ${error.message}`);
    }
  }

  // Calculate order weight from items
  calculateOrderWeight(items) {
    // Default weight calculation: 0.5kg per item
    return items.reduce((total, item) => total + (item.quantity * 0.5), 0);
  }

  // Get iThink Logistics tracking details
  async getIThinkLogisticsTracking(awbNumber) {
    try {
      const response = await axios.get(
        `https://my.ithinklogistics.com/api_v3/order/track.json`,
        {
          params: {
            access_token: process.env.ITHINK_ACCESS_TOKEN,
            secret_key: process.env.ITHINK_SECRET_KEY,
            store_id: process.env.ITHINK_STORE_ID,
            awb_number: awbNumber
          },
          timeout: 15000
        }
      );

      if (response.data && response.data.status === 'success') {
        return {
          success: true,
          tracking: response.data.data
        };
      } else {
        throw new Error(response.data?.message || 'Failed to get tracking details');
      }

    } catch (error) {
      throw error;
    }
  }

  // Check pincode availability with iThink Logistics
  async checkIThinkPincodeAvailability(pincode) {
    try {
      console.log('🔍 Checking pincode availability with iThink Logistics:', pincode);

      const requestData = {
        data: {
          access_token: process.env.ITHINK_ACCESS_TOKEN,
          secret_key: process.env.ITHINK_SECRET_KEY,
          pincode: parseInt(pincode)
        }
      };

      const response = await axios.post(
        'https://my.ithinklogistics.com/api_v3/pincode/check.json',
        requestData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      console.log('📡 iThink Logistics pincode check response:', response.data);

      if (response.data && response.data.status === 'success') {
        // Check if pincode data exists in response
        const pincodeData = response.data.data && response.data.data[pincode];
        const isAvailable = pincodeData && Object.keys(pincodeData).length > 0;
        console.log('✅ Pincode availability result:', isAvailable);
        return isAvailable;
      } else {
        console.log('❌ Pincode not available:', response.data?.message);
        return false;
      }

    } catch (error) {
      
      if (error.response) {
        console.log({
          status: error.response.status,
          data: error.response.data
        });
      }
      
      // If API fails, assume pincode is available for fallback
      return true;
    }
  }

  // Get shipping rates from iThink Logistics (returns rate and delivery time info)
  async getIThinkShippingRates(pincode, weight, orderValue) {
    try {
      console.log('💰 Getting shipping rates from iThink Logistics:', { pincode, weight, orderValue });

      const response = await axios.get(
        'https://my.ithinklogistics.com/api_v3/rate/check.json',
        {
          params: {
            access_token: process.env.ITHINK_ACCESS_TOKEN,
            secret_key: process.env.ITHINK_SECRET_KEY,
            store_id: process.env.ITHINK_STORE_ID,
            pickup_pincode: process.env.COMPANY_PINCODE || '110001',
            delivery_pincode: pincode,
            weight: weight || 1,
            cod_amount: orderValue
          },
          timeout: 10000
        }
      );

      console.log('📡 iThink Logistics rate check response:', response.data);

      if (response.data && response.data.status === 'success') {
        const ratesData = response.data.data;
        
        // iThink Logistics returns different formats, handle both array and object
        let rates = [];
        if (Array.isArray(ratesData)) {
          rates = ratesData;
        } else if (typeof ratesData === 'object' && ratesData !== null) {
          // If data is an object, try to extract rates from it
          if (ratesData.rates && Array.isArray(ratesData.rates)) {
            rates = ratesData.rates;
          } else if (ratesData.data && Array.isArray(ratesData.data)) {
            rates = ratesData.data;
          } else {
            // Single rate object
            rates = [ratesData];
          }
        }
        
        if (rates.length > 0) {
          // Get the first/best rate (usually sorted by price or service level)
          const bestRate = rates[0];
          
          // Extract shipping cost
          // iThink may return: rate, shipping_cost, amount, or price
          const shippingCost = bestRate.rate || bestRate.shipping_cost || bestRate.amount || bestRate.price || 0;
          
          // Make shipping free for orders above ₹1000
          const finalCost = orderValue > 1000 ? 0 : shippingCost;
          
          // Extract delivery time information from iThink Logistics response
          // Common fields: delivery_days, estimated_days, delivery_time, days, min_days, max_days
          let deliveryDays = null;
          
          // Try multiple possible field names
          if (bestRate.delivery_days !== undefined) {
            deliveryDays = bestRate.delivery_days;
          } else if (bestRate.estimated_days !== undefined) {
            deliveryDays = bestRate.estimated_days;
          } else if (bestRate.delivery_time !== undefined) {
            deliveryDays = bestRate.delivery_time;
          } else if (bestRate.days !== undefined) {
            deliveryDays = bestRate.days;
          } else if (bestRate.min_days !== undefined && bestRate.max_days !== undefined) {
            // If min and max days are provided, calculate average
            deliveryDays = {
              min: bestRate.min_days,
              max: bestRate.max_days
            };
          }
          
          // Calculate expected delivery date
          let estimatedDelivery = null;
          let estimatedDeliveryDays = null;
          
          if (deliveryDays !== null && deliveryDays !== undefined) {
            // If deliveryDays is a number, calculate date
            if (typeof deliveryDays === 'number') {
              estimatedDeliveryDays = Math.ceil(deliveryDays);
              const deliveryDate = new Date();
              deliveryDate.setDate(deliveryDate.getDate() + estimatedDeliveryDays);
              // Set time to end of business day
              deliveryDate.setHours(20, 0, 0, 0);
              estimatedDelivery = deliveryDate.toISOString();
            } else if (typeof deliveryDays === 'object') {
              // If it's an object with min/max days
              const minDays = deliveryDays.min || deliveryDays.minimum || 3;
              const maxDays = deliveryDays.max || deliveryDays.maximum || 5;
              estimatedDeliveryDays = Math.ceil((minDays + maxDays) / 2);
              const deliveryDate = new Date();
              deliveryDate.setDate(deliveryDate.getDate() + estimatedDeliveryDays);
              deliveryDate.setHours(20, 0, 0, 0);
              estimatedDelivery = deliveryDate.toISOString();
            }
          }
          
          // If no delivery days in response, use default (3-5 days based on distance)
          if (!estimatedDelivery) {
            // Default delivery time: 3-5 days
            const defaultDays = 4; // Average of 3-5 days
            estimatedDeliveryDays = defaultDays;
            const deliveryDate = new Date();
            deliveryDate.setDate(deliveryDate.getDate() + defaultDays);
            deliveryDate.setHours(20, 0, 0, 0);
            estimatedDelivery = deliveryDate.toISOString();
          }
          
          console.log('✅ Shipping rate and delivery time from iThink Logistics:', { 
            cost: finalCost, 
            estimatedDelivery, 
            estimatedDeliveryDays,
            rawResponse: bestRate
          });
          
          return {
            shippingCharges: finalCost,
            estimatedDelivery,
            estimatedDeliveryDays,
            rawRate: bestRate // Include full rate object for debugging
          };
        } else {
          // No rates available, use default
          console.log('⚠️ No rates available from iThink Logistics, using default');
          const defaultDays = 4;
          const deliveryDate = new Date();
          deliveryDate.setDate(deliveryDate.getDate() + defaultDays);
          deliveryDate.setHours(20, 0, 0, 0);
          return {
            shippingCharges: orderValue > 1000 ? 0 : 100,
            estimatedDelivery: deliveryDate.toISOString(),
            estimatedDeliveryDays: defaultDays
          };
        }
      } else {
        console.log('⚠️ iThink Logistics API error, using default rate');
        const defaultDays = 4;
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + defaultDays);
        return {
          shippingCharges: orderValue > 1000 ? 0 : 100,
          estimatedDelivery: deliveryDate.toISOString(),
          estimatedDeliveryDays: defaultDays
        };
      }

    } catch (error) {
      if (error.response) {
        console.log({
          status: error.response.status,
          data: error.response.data
        });
      }
      
      // Fallback to default rate and delivery time
      const defaultDays = 4;
      const deliveryDate = new Date();
      deliveryDate.setDate(deliveryDate.getDate() + defaultDays);
      return {
        shippingCharges: orderValue > 1000 ? 0 : 100,
        estimatedDelivery: deliveryDate.toISOString(),
        estimatedDeliveryDays: defaultDays
      };
    }
  }


  // Auto-track single order with iThink Logistics
  async autoTrackSingleOrder(awbNumber) {
    try {
      if (!awbNumber) {
        console.log('⚠️ No AWB number provided for tracking');
        return { success: false, message: 'No AWB number provided' };
      }

      console.log(`🔄 Auto-tracking single order with AWB: ${awbNumber}`);

      // Call iThink Logistics track API for single order
      const trackData = {
        data: {
          awb_number_list: awbNumber,
          access_token: process.env.ITHINK_ACCESS_TOKEN,
          secret_key: process.env.ITHINK_SECRET_KEY
        }
      };

      const response = await axios.post(
        'https://api.ithinklogistics.com/api_v3/order/track.json',
        trackData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );

      console.log('✅ iThink Logistics single order track response:', response.data);

      if (response.data && response.data.status === 'success') {
        // Process tracking data and update order status
        const updatedOrders = await this.processTrackingData(response.data.data);
        
        return {
          success: true,
          message: `Single order tracking completed. Updated ${updatedOrders.length} orders.`,
          updatedOrders: updatedOrders
        };
      } else {
        return {
          success: false,
          message: 'Single order tracking failed',
          error: response.data
        };
      }

    } catch (error) {
      return {
        success: false,
        message: 'Single order auto-tracking failed',
        error: error.message
      };
    }
  }

  // Auto-track orders with iThink Logistics
  async autoTrackOrders() {
    try {
      console.log('🔄 Starting auto-tracking of orders...');
      
      // Find all orders that are shipped and have AWB numbers
      const shippedOrders = await Order.find({
        orderStatus: 'shipped',
        ithinkAwbNumber: { $exists: true, $ne: null }
      });

      if (shippedOrders.length === 0) {
        console.log('📦 No shipped orders with AWB numbers found for tracking');
        return { success: true, message: 'No orders to track', updatedOrders: [] };
      }

      // Get all AWB numbers
      const awbNumbers = shippedOrders.map(order => order.ithinkAwbNumber).join(',');
      
      console.log(`📦 Tracking ${shippedOrders.length} orders with AWB numbers: ${awbNumbers}`);

      // Call iThink Logistics track API
      const trackData = {
        data: {
          awb_number_list: awbNumbers,
          access_token: process.env.ITHINK_ACCESS_TOKEN,
          secret_key: process.env.ITHINK_SECRET_KEY
        }
      };

      const response = await axios.post(
        'https://api.ithinklogistics.com/api_v3/order/track.json',
        trackData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );

      console.log('✅ iThink Logistics auto-track response:', response.data);

      if (response.data && response.data.status === 'success') {
        // Process tracking data and update order statuses
        const updatedOrders = await this.processTrackingData(response.data.data);
        
        console.log(`✅ Auto-tracking completed. Updated ${updatedOrders.length} orders.`);
        
        return {
          success: true,
          message: `Auto-tracking completed. Updated ${updatedOrders.length} orders.`,
          updatedOrders: updatedOrders
        };
      } else {
        return {
          success: false,
          message: 'Auto-tracking failed',
          error: response.data
        };
      }

    } catch (error) {
      return {
        success: false,
        message: 'Auto-tracking failed',
        error: error.message
      };
    }
  }

  // Process tracking data and update order statuses
  async processTrackingData(trackingData) {
    const updatedOrders = [];
    
    try {
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
                const notificationService = (await import('./notificationService.js')).default;
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
  }
}

export default new LogisticsService(); 