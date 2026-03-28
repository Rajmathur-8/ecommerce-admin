import DeliveryTracking from '../../models/deliveryTracking.js';
import Order from '../../models/order.js';
import logisticsService from '../../services/logisticsService.js';

// Get shipping partners for admin
export const getShippingPartners = async (req, res) => {
  try {
    const partners = await ShippingPartner.find({ isActive: true })
      .select('_id name displayName code isActive')
      .sort({ displayName: 1 });

    res.json({
      success: true,
      partners
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get logistics statistics
export const getLogisticsStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalDeliveries,
      activeDeliveries,
      deliveredToday,
      orderPlaced,
      pendingPickup,
      inTransit,
      outForDelivery,
      averageDeliveryTime
    ] = await Promise.all([
      DeliveryTracking.countDocuments({ isActive: true }),
      DeliveryTracking.countDocuments({
        isActive: true,
        status: { $nin: ['delivered', 'cancelled', 'returned'] }
      }),
      DeliveryTracking.countDocuments({
        isActive: true,
        status: 'delivered',
        actualDelivery: { $gte: today }
      }),
      DeliveryTracking.countDocuments({
        isActive: true,
        status: 'order_placed'
      }),
      DeliveryTracking.countDocuments({
        isActive: true,
        status: 'pending'
      }),
      DeliveryTracking.countDocuments({
        isActive: true,
        status: 'in_transit'
      }),
      DeliveryTracking.countDocuments({
        isActive: true,
        status: 'out_for_delivery'
      }),
      logisticsService.calculateAverageDeliveryTime({})
    ]);

    // Calculate success rate
    const deliveredCount = await DeliveryTracking.countDocuments({
      isActive: true,
      status: 'delivered'
    });
    const successRate = totalDeliveries > 0 ? Math.round((deliveredCount / totalDeliveries) * 100) : 0;

    const stats = {
      totalDeliveries,
      activeDeliveries,
      deliveredToday,
      orderPlaced,
      pendingPickup,
      inTransit,
      outForDelivery,
      averageDeliveryTime: Math.round(averageDeliveryTime),
      successRate
    };

    res.json({
      success: true,
      message: 'Logistics statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get logistics statistics'
    });
  }
};


// Get all deliveries with filters
export const getDeliveries = async (req, res) => {
  try {
    // Note: Auto-tracking is handled by frontend interval, not here to avoid redundant calls
    
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      partner = ''
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const matchStage = { isActive: true };

    // Add search filter
    if (search) {
      matchStage.$or = [
        { trackingNumber: { $regex: search, $options: 'i' } },
        { awbNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Add status filter
    if (status) {
      matchStage.status = status;
    }

    // Add partner filter
    if (partner) {
      matchStage.shippingPartner = partner;
    }

    // Get orders that have been synced with logistics OR are self logistics
    // Query: Any order with logisticsSynced: true (includes both iThink and self logistics)
    let orderMatchStage = {
      logisticsSynced: true
    };

    console.log('📦 Deliveries query (before filters):', JSON.stringify(orderMatchStage, null, 2));
    console.log('🔍 Status filter:', status);

    // Build additional conditions array
    const additionalConditions = [];

    // Add search filter for orders
    if (search) {
      additionalConditions.push({
        $or: [
          { orderNumber: { $regex: search, $options: 'i' } },
          { ithinkAwbNumber: { $regex: search, $options: 'i' } },
          { trackingNumber: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // Add status filter for orders
    if (status) {
      additionalConditions.push({ orderStatus: status });
    }

    // Combine all conditions using $and if we have additional conditions
    if (additionalConditions.length > 0) {
      orderMatchStage = {
        $and: [
          orderMatchStage,
          ...additionalConditions
        ]
      };
    }

    console.log('📦 Final orderMatchStage:', JSON.stringify(orderMatchStage, null, 2));

    const [orders, total] = await Promise.all([
      Order.find(orderMatchStage)
        .populate('user', 'name email')
        .populate({
          path: 'items.product',
          select: 'productName images price',
          model: 'Product'
        })
        // Note: items.manualProduct is an embedded document, not a reference, so no populate needed
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(orderMatchStage)
    ]);

    console.log(`📊 Found ${orders.length} orders out of ${total} total`);
    if (orders.length > 0) {
      console.log('📦 Sample order:', {
        orderNumber: orders[0].orderNumber,
        orderStatus: orders[0].orderStatus,
        logisticsType: orders[0].logisticsType,
        logisticsSynced: orders[0].logisticsSynced,
        itemsCount: orders[0].items?.length
      });
    }

    // Transform orders to delivery format
    const deliveries = orders.map(order => {
      // Determine shipping partner based on logistics type
      let shippingPartner;
      if (order.logisticsType === 'self') {
        shippingPartner = {
          _id: 'self',
          name: 'Self Logistics',
          displayName: 'Self Logistics',
          trackingUrl: null
        };
      } else {
        shippingPartner = order.shippingPartner || {
          _id: 'ithink',
          name: 'iThink Logistics',
          displayName: 'iThink Logistics',
          trackingUrl: 'https://track.ithinklogistics.com'
        };
      }

      return {
        _id: order._id,
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          total: order.total,
          items: order.items,
          address: order.address
        },
        shippingPartner: shippingPartner,
        trackingNumber: order.logisticsType === 'self' 
          ? (order.trackingNumber || 'SELF-' + order.orderNumber)
          : (order.trackingNumber || order.ithinkAwbNumber || null),
        awbNumber: order.logisticsType === 'self' 
          ? null  // Self logistics doesn't have AWB number
          : (order.ithinkAwbNumber || null),  // Only iThink Logistics has AWB
        status: order.orderStatus,
        currentLocation: {
          city: order.address?.city || 'Unknown',
          state: order.address?.state || 'Unknown'
        },
        estimatedDelivery: order.estimatedDelivery || null,
        actualDelivery: order.deliveredAt || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        logisticsType: order.logisticsType || 'ithink',
        selfLogisticsDetails: order.selfLogisticsDetails || null
      };
    });

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      message: 'Deliveries retrieved successfully',
      data: {
        deliveries,
        totalPages,
        currentPage: parseInt(page),
        total
      }
    });

  } catch (error) {
    console.error('❌ Error fetching deliveries:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to get deliveries',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get delivery details
export const getDeliveryDetails = async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const delivery = await DeliveryTracking.findOne({ trackingNumber })
      .populate('order', 'orderStatus total items address')
      .populate('shippingPartner', 'name displayName trackingUrl website');

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    res.json({
      success: true,
      message: 'Delivery details retrieved successfully',
      data: delivery
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery details'
    });
  }
};

// Create shipment for order
export const createShipment = async (req, res) => {
  try {
    const { orderId, partnerId, packageDetails } = req.body;

    if (!orderId || !partnerId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID and partner ID are required'
      });
    }

    // Check if shipment already exists
    const existingShipment = await DeliveryTracking.findOne({ order: orderId });
    if (existingShipment) {
      return res.status(400).json({
        success: false,
        message: 'Shipment already exists for this order'
      });
    }

    const result = await logisticsService.createShipment(orderId, partnerId, packageDetails);

    res.json({
      success: true,
      message: 'Shipment created successfully',
      data: result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create shipment'
    });
  }
};

// Update shipment status
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

    const deliveryTracking = await logisticsService.updateShipmentStatus(
      trackingNumber,
      status,
      location,
      description
    );

    res.json({
      success: true,
      message: 'Shipment status updated successfully',
      data: deliveryTracking
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update shipment status'
    });
  }
};

// Add delivery note
export const addDeliveryNote = async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { note } = req.body;

    if (!trackingNumber || !note) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number and note are required'
      });
    }

    const deliveryTracking = await DeliveryTracking.findOne({ trackingNumber });
    if (!deliveryTracking) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    await deliveryTracking.addNote(note, 'admin');

    res.json({
      success: true,
      message: 'Note added successfully',
      data: deliveryTracking
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
        order: deliveryTracking.order
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery timeline'
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
      data: deliveries
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get active deliveries'
    });
  }
};

// Export deliveries data
export const exportDeliveries = async (req, res) => {
  try {
    const { format = 'csv', status = '', partner = '' } = req.query;

    const matchStage = { isActive: true };

    if (status) {
      matchStage.status = status;
    }

    if (partner) {
      matchStage.shippingPartner = partner;
    }

    const deliveries = await DeliveryTracking.find(matchStage)
      .populate('order', 'orderStatus total')
      .populate('shippingPartner', 'name displayName')
      .sort({ createdAt: -1 });

    let data;
    let filename;
    let contentType;

    if (format === 'csv') {
      data = convertToCSV(deliveries);
      filename = `deliveries_${new Date().toISOString().split('T')[0]}.csv`;
      contentType = 'text/csv';
    } else {
      data = JSON.stringify(deliveries, null, 2);
      filename = `deliveries_${new Date().toISOString().split('T')[0]}.json`;
      contentType = 'application/json';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to export deliveries'
    });
  }
};

// Assign delivery boy to shipment (Admin)
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

// Mark shipment as delivered (Admin)
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

// Get delivery boy dashboard (Admin)
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

// Get all delivery boys and their stats
export const getDeliveryBoys = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all unique delivery boys from active deliveries
    const deliveryBoys = await DeliveryTracking.aggregate([
      {
        $match: {
          isActive: true,
          'deliveryBoy.id': { $exists: true },
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$deliveryBoy.id',
          name: { $first: '$deliveryBoy.name' },
          phone: { $first: '$deliveryBoy.phone' },
          totalAssigned: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'out_for_delivery'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          id: '$_id',
          name: 1,
          phone: 1,
          totalAssigned: 1,
          delivered: 1,
          pending: 1,
          successRate: {
            $round: [
              { $multiply: [{ $divide: ['$delivered', '$totalAssigned'] }, 100] },
              2
            ]
          }
        }
      },
      { $sort: { totalAssigned: -1 } }
    ]);

    res.json({
      success: true,
      message: 'Delivery boys retrieved successfully',
      data: deliveryBoys
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery boys'
    });
  }
};

// Bulk update delivery statuses
export const bulkUpdateDeliveryStatuses = async (req, res) => {
  try {
    const { updates } = req.body; // Array of { trackingNumber, status, location, description }

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Updates array is required'
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { trackingNumber, status, location, description } = update;
        
        if (!trackingNumber || !status) {
          errors.push({
            trackingNumber: trackingNumber || 'unknown',
            error: 'Tracking number and status are required'
          });
          continue;
        }

        const deliveryTracking = await logisticsService.updateShipmentStatus(
          trackingNumber,
          status,
          location,
          description
        );

        results.push({
          trackingNumber,
          status: 'success',
          data: deliveryTracking
        });
      } catch (error) {
        errors.push({
          trackingNumber: update.trackingNumber || 'unknown',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk update completed. ${results.length} successful, ${errors.length} failed`,
      data: {
        successful: results,
        failed: errors
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk update'
    });
  }
};

// Add new shipping partner
export const addShippingPartner = async (req, res) => {
  try {
    const partnerData = req.body;

    // Check if partner with same code already exists
    const existingPartner = await ShippingPartner.findOne({ code: partnerData.code });
    if (existingPartner) {
      return res.status(400).json({
        success: false,
        message: 'Partner with this code already exists'
      });
    }

    const partner = new ShippingPartner(partnerData);
    await partner.save();

    res.status(201).json({
      success: true,
      message: 'Shipping partner added successfully',
      data: partner
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add shipping partner'
    });
  }
};

// Update shipping partner
export const updateShippingPartner = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const updateData = req.body;

    // Check if partner exists
    const partner = await ShippingPartner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Shipping partner not found'
      });
    }

    // Check if code is being changed and if new code already exists
    if (updateData.code && updateData.code !== partner.code) {
      const existingPartner = await ShippingPartner.findOne({ 
        code: updateData.code,
        _id: { $ne: partnerId }
      });
      if (existingPartner) {
        return res.status(400).json({
          success: false,
          message: 'Partner with this code already exists'
        });
      }
    }

    const updatedPartner = await ShippingPartner.findByIdAndUpdate(
      partnerId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Shipping partner updated successfully',
      data: updatedPartner
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update shipping partner'
    });
  }
};

// Delete shipping partner
export const deleteShippingPartner = async (req, res) => {
  try {
    const { partnerId } = req.params;

    const partner = await ShippingPartner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Shipping partner not found'
      });
    }

    // Check if partner has active deliveries
    const activeDeliveries = await DeliveryTracking.countDocuments({
      shippingPartner: partnerId,
      isActive: true,
      status: { $nin: ['delivered', 'cancelled', 'returned'] }
    });

    if (activeDeliveries > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete partner with active deliveries'
      });
    }

    // Soft delete by setting isActive to false
    await ShippingPartner.findByIdAndUpdate(partnerId, { isActive: false });

    res.json({
      success: true,
      message: 'Shipping partner deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete shipping partner'
    });
  }
};

// Get shipping partner details
export const getShippingPartnerDetails = async (req, res) => {
  try {
    const { partnerId } = req.params;

    const partner = await ShippingPartner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Shipping partner not found'
      });
    }

    // Get partner statistics
    const stats = await DeliveryTracking.aggregate([
      {
        $match: { shippingPartner: partner._id, isActive: true }
      },
      {
        $group: {
          _id: null,
          totalDeliveries: { $sum: 1 },
          delivered: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          inTransit: {
            $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          averageDeliveryTime: { $avg: '$deliveryTime' }
        }
      }
    ]);

    const partnerStats = stats[0] || {
      totalDeliveries: 0,
      delivered: 0,
      inTransit: 0,
      failed: 0,
      averageDeliveryTime: 0
    };

    partnerStats.successRate = partnerStats.totalDeliveries > 0 
      ? Math.round((partnerStats.delivered / partnerStats.totalDeliveries) * 100)
      : 0;

    res.json({
      success: true,
      message: 'Shipping partner details retrieved successfully',
      data: {
        partner,
        stats: partnerStats
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get shipping partner details'
    });
  }
};

// Sync shipping partners with iThink Logistics
export const syncShippingPartnersWithIThink = async (req, res) => {
  try {
    // This would typically call iThink Logistics API to get available shipping partners
    // For now, we'll create some default partners that would come from iThink Logistics
    
    const ithinkPartners = [
      {
        name: 'Blue Dart',
        code: 'BLUEDART',
        displayName: 'Blue Dart Express',
        description: 'Premium express delivery service',
        website: 'https://www.bluedart.com',
        trackingUrl: 'https://www.bluedart.com/track/{tracking}',
        isActive: true,
        isPopular: true,
        status: 'active',
        deliveryTime: {
          min: 1,
          max: 3,
          unit: 'days'
        },
        pricing: {
          basePrice: 0,
          perKgPrice: 0,
          freeShippingThreshold: 0
        },
        weightLimits: {
          min: 0,
          max: 50,
          unit: 'kg'
        },
        dimensions: {
          maxLength: 150,
          maxWidth: 150,
          maxHeight: 150,
          unit: 'cm'
        },
        supportedPincodes: [],
        restrictedPincodes: [],
        rating: 4.5,
        totalDeliveries: 0,
        successRate: 95
      },
      {
        name: 'DTDC',
        code: 'DTDC',
        displayName: 'DTDC Express Limited',
        description: 'Reliable courier and logistics service',
        website: 'https://www.dtdc.com',
        trackingUrl: 'https://www.dtdc.com/tracking/{tracking}',
        isActive: true,
        isPopular: true,
        status: 'active',
        deliveryTime: {
          min: 2,
          max: 5,
          unit: 'days'
        },
        pricing: {
          basePrice: 0,
          perKgPrice: 0,
          freeShippingThreshold: 0
        },
        weightLimits: {
          min: 0,
          max: 30,
          unit: 'kg'
        },
        dimensions: {
          maxLength: 120,
          maxWidth: 120,
          maxHeight: 120,
          unit: 'cm'
        },
        supportedPincodes: [],
        restrictedPincodes: [],
        rating: 4.2,
        totalDeliveries: 0,
        successRate: 92
      },
      {
        name: 'Delhivery',
        code: 'DELHIVERY',
        displayName: 'Delhivery Limited',
        description: 'Technology-enabled logistics platform',
        website: 'https://www.delhivery.com',
        trackingUrl: 'https://www.delhivery.com/track/{tracking}',
        isActive: true,
        isPopular: false,
        status: 'active',
        deliveryTime: {
          min: 1,
          max: 4,
          unit: 'days'
        },
        pricing: {
          basePrice: 0,
          perKgPrice: 0,
          freeShippingThreshold: 0
        },
        weightLimits: {
          min: 0,
          max: 25,
          unit: 'kg'
        },
        dimensions: {
          maxLength: 100,
          maxWidth: 100,
          maxHeight: 100,
          unit: 'cm'
        },
        supportedPincodes: [],
        restrictedPincodes: [],
        rating: 4.0,
        totalDeliveries: 0,
        successRate: 88
      }
    ];

    let syncedCount = 0;
    let updatedCount = 0;

    for (const partnerData of ithinkPartners) {
      // Check if partner already exists
      const existingPartner = await ShippingPartner.findOne({ code: partnerData.code });
      
      if (existingPartner) {
        // Update existing partner with latest data from iThink Logistics
        await ShippingPartner.findByIdAndUpdate(existingPartner._id, {
          ...partnerData,
          // Keep existing delivery stats
          totalDeliveries: existingPartner.totalDeliveries,
          successRate: existingPartner.successRate,
          rating: existingPartner.rating
        });
        updatedCount++;
      } else {
        // Create new partner
        const newPartner = new ShippingPartner(partnerData);
        await newPartner.save();
        syncedCount++;
      }
    }

    res.json({
      success: true,
      message: `Successfully synced with iThink Logistics. ${syncedCount} new partners added, ${updatedCount} partners updated.`,
      data: {
        newPartners: syncedCount,
        updatedPartners: updatedCount,
        totalPartners: syncedCount + updatedCount
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to sync with iThink Logistics'
    });
  }
};

// Helper function to convert deliveries to CSV
const convertToCSV = (deliveries) => {
  const headers = [
    'Tracking Number',
    'AWB Number',
    'Order ID',
    'Order Status',
    'Order Total',
    'Shipping Partner',
    'Delivery Status',
    'Current Location',
    'Estimated Delivery',
    'Actual Delivery',
    'Pickup Date',
    'Delivery Attempts',
    'Package Weight',
    'Declared Value',
    'Recipient Name',
    'Recipient Mobile',
    'Recipient Address',
    'Created At'
  ];

  const rows = deliveries.map(delivery => [
    delivery.trackingNumber,
    delivery.awbNumber || '',
    delivery.order?._id || '',
    delivery.order?.orderStatus || '',
    delivery.order?.total || '',
    delivery.shippingPartner?.displayName || '',
    delivery.status,
    delivery.currentLocation ? `${delivery.currentLocation.city}, ${delivery.currentLocation.state}` : '',
    delivery.estimatedDelivery ? new Date(delivery.estimatedDelivery).toLocaleDateString() : '',
    delivery.actualDelivery ? new Date(delivery.actualDelivery).toLocaleDateString() : '',
    delivery.pickupDate ? new Date(delivery.pickupDate).toLocaleDateString() : '',
    delivery.deliveryAttempts,
    delivery.packageDetails?.weight || '',
    delivery.packageDetails?.declaredValue || '',
    delivery.recipientDetails?.name || '',
    delivery.recipientDetails?.mobile || '',
    delivery.recipientDetails?.address || '',
    new Date(delivery.createdAt).toLocaleDateString()
  ]);

  return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
};

// Get order-logistics partner mapping (simple table view)
export const getOrderLogisticsMapping = async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build match criteria for orders that have logistics info
    let matchCriteria = {
      $or: [
        { logisticsSynced: true },
        { ithinkAwbNumber: { $exists: true, $ne: null } },
        { trackingNumber: { $exists: true, $ne: null } }
      ]
    };

    // Add search filter if provided
    if (search) {
      matchCriteria.$and = [
        {
          $or: [
            { orderNumber: { $regex: search, $options: 'i' } },
            { trackingNumber: { $regex: search, $options: 'i' } },
            { ithinkAwbNumber: { $regex: search, $options: 'i' } }
          ]
        }
      ];
    }

    // Get orders with real-time logistics information from iThink Logistics
    const orders = await Order.aggregate([
      { $match: matchCriteria },
      {
        $addFields: {
          // Extract actual logistics partner name from iThink data (real-time from add.json API)
          logisticsPartnerName: {
            $cond: {
              if: { $ne: ['$ithinkLogisticsData.logistics', null] },
              then: '$ithinkLogisticsData.logistics',
              else: {
                $cond: {
                  if: { $ne: ['$logisticsPartner', null] },
                  then: 'iThink Logistics',
                  else: 'Not Assigned'
                }
              }
            }
          },
          // Extract service type if available (from add.json API selection)
          logisticsServiceType: {
            $cond: {
              if: { $ne: ['$ithinkLogisticsData.s_type', null] },
              then: '$ithinkLogisticsData.s_type',
              else: null
            }
          },
          // Show when logistics was assigned
          logisticsAssignedAt: {
            $cond: {
              if: { $ne: ['$logisticsSyncedAt', null] },
              then: '$logisticsSyncedAt',
              else: null
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          orderNumber: 1,
          orderStatus: 1,
          total: 1,
          trackingNumber: 1,
          ithinkAwbNumber: 1,
          logisticsPartnerName: 1,
          logisticsServiceType: 1,
          logisticsAssignedAt: 1,
          logisticsSynced: 1,
          createdAt: 1,
          'items.product': 1
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    // Get total count for pagination
    const totalCount = await Order.countDocuments(matchCriteria);

    // Transform data for real-time table view
    const mappings = orders.map(order => ({
      orderId: order._id,
      orderNumber: order.orderNumber || `ORD-${order._id.slice(-6).toUpperCase()}`,
      logisticsPartnerName: order.logisticsPartnerName,
      logisticsServiceType: order.logisticsServiceType,
      orderStatus: order.orderStatus,
      trackingNumber: order.trackingNumber || order.ithinkAwbNumber || '-',
      totalAmount: order.total,
      orderDate: order.createdAt,
      logisticsAssignedAt: order.logisticsAssignedAt,
      isLogisticsSynced: order.logisticsSynced
    }));

    res.json({
      success: true,
      data: mappings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNext: skip + parseInt(limit) < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order-logistics mapping'
    });
  }
};
