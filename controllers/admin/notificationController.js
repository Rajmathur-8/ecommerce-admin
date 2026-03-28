import NotificationLog from '../../models/notificationLog.js';
import Order from '../../models/order.js';

// Get all notification logs
export const getNotificationLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status, orderId } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (orderId) query.order = orderId;

    const logs = await NotificationLog.find(query)
      .populate('order', 'orderStatus total createdAt')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await NotificationLog.countDocuments(query);

    res.json({
      success: true,
      message: 'Notification logs retrieved successfully',
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
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

// Get notification statistics
export const getNotificationStats = async (req, res) => {
  try {
    const totalNotifications = await NotificationLog.countDocuments();
    const sentNotifications = await NotificationLog.countDocuments({ status: 'sent' });
    const failedNotifications = await NotificationLog.countDocuments({ status: 'failed' });
    const pendingNotifications = await NotificationLog.countDocuments({ status: 'pending' });

    const typeStats = await NotificationLog.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      }
    ]);

    const statusStats = await NotificationLog.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      message: 'Notification statistics retrieved successfully',
      data: {
        total: totalNotifications,
        sent: sentNotifications,
        failed: failedNotifications,
        pending: pendingNotifications,
        successRate: totalNotifications > 0 ? ((sentNotifications / totalNotifications) * 100).toFixed(2) : 0,
        typeStats,
        statusStats
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Resend failed notification
export const resendNotification = async (req, res) => {
  try {
    const { logId } = req.params;

    const log = await NotificationLog.findById(logId)
      .populate('order')
      .populate('user');

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Notification log not found'
      });
    }

    if (log.status === 'sent') {
      return res.status(400).json({
        success: false,
        message: 'Notification was already sent successfully'
      });
    }

    // Import notification service
    const notificationService = (await import('../../services/notificationService.js')).default;

    let result;
    switch (log.type) {
      case 'email':
        result = await notificationService.sendEmail(log.recipient, log.subject, log.message);
        break;
      case 'sms':
        result = await notificationService.sendSMS(log.recipient, log.message);
        break;
      case 'whatsapp':
        result = await notificationService.sendWhatsApp(log.recipient, log.message);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid notification type'
        });
    }

    // Update log status
    await notificationService.updateNotificationLog(logId, result.success ? 'sent' : 'failed', result.error);

    res.json({
      success: true,
      message: result.success ? 'Notification sent successfully' : 'Failed to send notification',
      data: {
        success: result.success,
        error: result.error
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get notification logs for a specific order
export const getOrderNotificationLogs = async (req, res) => {
  try {
    const { orderId } = req.params;

    const logs = await NotificationLog.find({ order: orderId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Order notification logs retrieved successfully',
      data: {
        logs
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

 