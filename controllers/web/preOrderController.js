import PreOrderNotification from '../../models/preOrderNotification.js';
import Product from '../../models/product.js';
import { sendPreOrderNotification } from '../../services/notificationService.js';

// Create pre-order notification (Notify Me)
export const createPreOrderNotification = async (req, res) => {
  try {
    const { productId, name, email, phone } = req.body;
    const userId = req.user?.id || null;

    // Validation
    if (!productId || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, name, and email are required'
      });
    }

    // Check if product exists and is pre-order
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.isPreOrder) {
      return res.status(400).json({
        success: false,
        message: 'This product is not available for pre-order'
      });
    }

    // Check if user already has a notification for this product
    const existingNotification = userId
      ? await PreOrderNotification.findOne({ user: userId, product: productId, status: 'pending' })
      : await PreOrderNotification.findOne({ email: email.toLowerCase(), product: productId, status: 'pending' });

    if (existingNotification) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for notifications on this product'
      });
    }

    // Create pre-order notification
    const notification = await PreOrderNotification.create({
      product: productId,
      user: userId,
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      notificationChannels: {
        email: true,
        sms: phone ? true : false,
        whatsapp: phone ? true : false
      },
      status: 'pending'
    });

    // Send initial notification (WhatsApp, SMS, Email)
    try {
      await sendPreOrderNotification(notification, product, 'registered');
    } catch (error) {
      // Don't fail the request if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'You will be notified when this product becomes available!',
      data: notification
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to register for notification',
      error: err.message
    });
  }
};

// Get user's pre-order notifications
export const getUserPreOrderNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const notifications = await PreOrderNotification.find({ user: userId })
      .populate('product', 'productName price discountPrice images isPreOrder stock')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: notifications
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: err.message
    });
  }
};

// Remove pre-order notification
export const removePreOrderNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user?.id;

    const notification = await PreOrderNotification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user owns this notification
    if (userId && notification.user && notification.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Update status to expired
    notification.status = 'expired';
    await notification.save();

    res.json({
      success: true,
      message: 'Notification removed successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove notification',
      error: err.message
    });
  }
};

