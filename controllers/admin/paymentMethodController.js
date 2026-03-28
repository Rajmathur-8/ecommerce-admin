import PaymentMethod from '../../models/paymentMethod.js';

// Get all payment methods (admin)
export const getAllPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find()
      .sort({ order: 1, createdAt: 1 });
    
    res.json({ 
      success: true, 
      paymentMethods 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment methods' 
    });
  }
};

// Create new payment method
export const createPaymentMethod = async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      icon,
      isActive = true,
      isPopular = false,
      order = 0,
      config = {},
      restrictions = {}
    } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and display name are required' 
      });
    }

    // Check if payment method with same name already exists
    const existingMethod = await PaymentMethod.findOne({ name });
    if (existingMethod) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment method with this name already exists' 
      });
    }

    const paymentMethod = new PaymentMethod({
      name,
      displayName,
      description,
      icon,
      isActive,
      isPopular,
      order,
      config,
      restrictions
    });

    await paymentMethod.save();

    res.status(201).json({ 
      success: true, 
      paymentMethod 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create payment method' 
    });
  }
};

// Update payment method
export const updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const paymentMethod = await PaymentMethod.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!paymentMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }

    res.json({ 
      success: true, 
      paymentMethod 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update payment method' 
    });
  }
};

// Delete payment method
export const deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    
    const paymentMethod = await PaymentMethod.findByIdAndDelete(id);
    
    if (!paymentMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Payment method deleted successfully' 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete payment method' 
    });
  }
};

// Toggle payment method status
export const togglePaymentMethodStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const paymentMethod = await PaymentMethod.findById(id);
    
    if (!paymentMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }

    paymentMethod.isActive = !paymentMethod.isActive;
    await paymentMethod.save();

    res.json({ 
      success: true, 
      paymentMethod 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to toggle payment method status' 
    });
  }
};

// Reorder payment methods
export const reorderPaymentMethods = async (req, res) => {
  try {
    const { orderData } = req.body; // Array of { id, order }
    
    if (!Array.isArray(orderData)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order data must be an array' 
      });
    }

    // Update each payment method's order
    for (const item of orderData) {
      await PaymentMethod.findByIdAndUpdate(item.id, { order: item.order });
    }

    res.json({ 
      success: true, 
      message: 'Payment methods reordered successfully' 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reorder payment methods' 
    });
  }
}; 

// Save Razorpay configuration
export const saveRazorpayConfig = async (req, res) => {
  try {
    const { keyId, keySecret } = req.body;

    if (!keyId || !keySecret) {
      return res.status(400).json({ 
        success: false, 
        message: 'Key ID and Key Secret are required' 
      });
    }

    // Find existing Razorpay payment method
    let razorpayMethod = await PaymentMethod.findOne({ name: 'Razorpay' });

    if (razorpayMethod) {
      // Update existing Razorpay method with new config
      razorpayMethod.config = {
        ...razorpayMethod.config,
        razorpayKeyId: keyId,
        razorpayKeySecret: keySecret
      };
      razorpayMethod.isConfigured = true;
      await razorpayMethod.save();
    } else {
      // Create new Razorpay payment method
      razorpayMethod = new PaymentMethod({
        name: 'Razorpay',
        displayName: 'Razorpay',
        description: 'Popular payment gateway for Indian businesses',
        icon: 'credit-card',
        isActive: true,
        isConfigured: true,
        order: 1,
        config: {
          razorpayKeyId: keyId,
          razorpayKeySecret: keySecret
        },
        restrictions: {}
      });
      await razorpayMethod.save();
    }

    res.json({ 
      success: true, 
      message: 'Razorpay configuration saved successfully',
      paymentMethod: razorpayMethod
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save Razorpay configuration' 
    });
  }
};

// Save webhook configuration
export const saveWebhookConfig = async (req, res) => {
  try {
    const { webhookUrl, events } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Webhook URL is required' 
      });
    }

    // Validate URL format
    try {
      new URL(webhookUrl);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid webhook URL format' 
      });
    }

    // Find existing Razorpay payment method
    let razorpayMethod = await PaymentMethod.findOne({ name: 'Razorpay' });

    if (razorpayMethod) {
      // Update existing Razorpay method with webhook config
      razorpayMethod.config = {
        ...razorpayMethod.config,
        webhookUrl: webhookUrl,
        webhookEvents: events || []
      };
      await razorpayMethod.save();
    } else {
      // Create new Razorpay payment method with webhook config
      razorpayMethod = new PaymentMethod({
        name: 'Razorpay',
        displayName: 'Razorpay',
        description: 'Popular payment gateway for Indian businesses',
        icon: 'credit-card',
        isActive: true,
        isConfigured: true,
        order: 1,
        config: {
          webhookUrl: webhookUrl,
          webhookEvents: events || []
        },
        restrictions: {}
      });
      await razorpayMethod.save();
    }

    res.json({ 
      success: true, 
      message: 'Webhook configuration saved successfully',
      paymentMethod: razorpayMethod
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save webhook configuration' 
    });
  }
};

// Delete webhook configuration
export const deleteWebhookConfig = async (req, res) => {
  try {
    // Find existing Razorpay payment method
    const razorpayMethod = await PaymentMethod.findOne({ name: 'Razorpay' });

    if (!razorpayMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Razorpay payment method not found' 
      });
    }

    // Remove webhook configuration safely
    if (razorpayMethod.config) {
      delete razorpayMethod.config.webhookUrl;
      delete razorpayMethod.config.webhookEvents;
    }
    
    await razorpayMethod.save();

    res.json({ 
      success: true, 
      message: 'Webhook configuration deleted successfully',
      paymentMethod: razorpayMethod
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete webhook configuration' 
    });
  }
};

// Delete Razorpay configuration
export const deleteRazorpayConfig = async (req, res) => {
  try {
    console.log('Delete Razorpay config request received');
    
    // Find existing Razorpay payment method
    const razorpayMethod = await PaymentMethod.findOne({ name: 'Razorpay' });
    console.log('Found Razorpay method:', razorpayMethod ? 'Yes' : 'No');

    if (!razorpayMethod) {
      console.log('Razorpay payment method not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Razorpay payment method not found' 
      });
    }

    console.log('Current config before deletion:', razorpayMethod.config);

    // Remove Razorpay configuration safely
    if (razorpayMethod.config) {
      delete razorpayMethod.config.razorpayKeyId;
      delete razorpayMethod.config.razorpayKeySecret;
      console.log('Config after deletion:', razorpayMethod.config);
    }
    
    razorpayMethod.isConfigured = false;
    await razorpayMethod.save();
    console.log('Razorpay configuration deleted successfully');

    res.json({ 
      success: true, 
      message: 'Razorpay configuration deleted successfully',
      paymentMethod: razorpayMethod
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete Razorpay configuration' 
    });
  }
}; 