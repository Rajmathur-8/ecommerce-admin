import Enquiry from '../../models/enquiry.js';
import User from '../../models/user.js';
import Order from '../../models/order.js';
import Product from '../../models/product.js';

// Get all enquiries with filters
export const getAllEnquiries = async (req, res) => {
  try {
    const {
      status,
      type,
      priority,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};

    // Status filter
    if (status) {
      query.status = status;
    }

    // Type filter
    if (type) {
      query.type = type;
    }

    // Priority filter
    if (priority) {
      query.priority = priority;
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const enquiries = await Enquiry.find(query)
      .populate('user', 'name email phone')
      .populate('order', 'orderNumber')
      .populate('product', 'productName')
      .populate('repliedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await Enquiry.countDocuments(query);

    res.json({
      success: true,
      data: enquiries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enquiries',
      error: err.message
    });
  }
};

// Get enquiry by ID
export const getEnquiryById = async (req, res) => {
  try {
    const { id } = req.params;

    const enquiry = await Enquiry.findById(id)
      .populate('user', 'name email phone')
      .populate('order', 'orderNumber')
      .populate('product', 'productName')
      .populate('repliedBy', 'name email');

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }

    res.json({
      success: true,
      data: enquiry
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enquiry',
      error: err.message
    });
  }
};

// Update enquiry status
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, tags, internalNotes } = req.body;

    const updateData = {};
    
    if (status) {
      updateData.status = status;
    }
    if (priority) {
      updateData.priority = priority;
    }
    if (tags !== undefined) {
      updateData.tags = tags;
    }
    if (internalNotes !== undefined) {
      updateData.internalNotes = internalNotes;
    }

    const enquiry = await Enquiry.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('user', 'name email phone');

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }

    res.json({
      success: true,
      message: 'Enquiry updated successfully',
      data: enquiry
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update enquiry',
      error: err.message
    });
  }
};

// Reply to enquiry
export const replyToEnquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminResponse } = req.body;
    const adminId = req.user.id;

    if (!adminResponse) {
      return res.status(400).json({
        success: false,
        message: 'Response message is required'
      });
    }

    const enquiry = await Enquiry.findByIdAndUpdate(
      id,
      {
        adminResponse,
        repliedBy: adminId,
        repliedAt: new Date(),
        status: 'replied'
      },
      { new: true }
    ).populate('user', 'name email phone')
     .populate('repliedBy', 'name email');

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }

    // Send notifications to customer (Email, SMS, WhatsApp)
    try {
      const notificationService = (await import('../../services/notificationService.js')).default;
      
      const customerName = enquiry.user?.name || enquiry.name || 'Customer';
      const customerEmail = enquiry.user?.email || enquiry.email;
      const customerPhone = enquiry.user?.phone || enquiry.phone;

      // Prepare notification messages
      const emailSubject = `Reply to your enquiry: ${enquiry.subject}`;
      const emailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
            <tr>
              <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Support Response</h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <h2 style="margin: 0 0 10px 0; color: #1f2937; font-size: 20px; font-weight: 600;">Hello ${customerName},</h2>
                      <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">Thank you for contacting us. We have received your enquiry and our support team has responded.</p>
                      
                      <!-- Your Enquiry Section -->
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <h3 style="margin: 0 0 16px 0; color: #1f2937; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                          <span style="display: inline-block; width: 4px; height: 16px; background-color: #6b7280; border-radius: 2px; margin-right: 8px;"></span>
                          Your Enquiry
                        </h3>
                        <div style="margin-bottom: 12px;">
                          <p style="margin: 0; color: #6b7280; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Subject</p>
                          <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 15px; font-weight: 500;">${enquiry.subject}</p>
                        </div>
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0; color: #6b7280; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Message</p>
                          <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${enquiry.message}</p>
                        </div>
                      </div>
                      
                      <!-- Admin Response Section -->
                      <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-left: 4px solid #10b981; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                        <h3 style="margin: 0 0 16px 0; color: #065f46; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                          <span style="display: inline-block; width: 4px; height: 16px; background-color: #10b981; border-radius: 2px; margin-right: 8px;"></span>
                          Our Response
                        </h3>
                        <p style="margin: 0; color: #047857; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${adminResponse}</p>
                      </div>
                      
                      <!-- Footer Message -->
                      <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">If you have any further questions, please don't hesitate to contact us.</p>
                      
                      <!-- Closing -->
                      <p style="margin: 0; color: #6b7280; font-size: 14px;">
                        Best regards,<br>
                        <strong style="color: #1f2937;">Support Team</strong>
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #9ca3af; font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      // SMS message with full reply (SMS can be up to 1600 characters for concatenated messages)
      const smsMessage = `Hello ${customerName}!\n\nWe have replied to your enquiry:\n\nSubject: ${enquiry.subject}\n\nAdmin Reply:\n${adminResponse}\n\nThank you for contacting us.`;

      // WhatsApp message with full reply
      const whatsappMessage = `Hello ${customerName}! 👋\n\n✅ *We have replied to your enquiry*\n\n📋 *Subject:* ${enquiry.subject}\n\n💬 *Your Message:*\n${enquiry.message}\n\n✅ *Admin Reply:*\n${adminResponse}\n\nIf you have any further questions, please contact us.\n\nBest regards,\nSupport Team`;

      const notifications = [];

      // Send Email
      if (customerEmail) {
        try {
          const emailResult = await notificationService.sendEmail(customerEmail, emailSubject, emailContent);
          notifications.push({
            type: 'email',
            recipient: customerEmail,
            success: emailResult.success,
            error: emailResult.error
          });
          console.log('📧 Enquiry reply email sent:', emailResult.success ? 'Success' : emailResult.error);
        } catch (emailError) {
          notifications.push({
            type: 'email',
            recipient: customerEmail,
            success: false,
            error: emailError.message
          });
        }
      }

      // Send SMS
      if (customerPhone) {
        try {
          const smsResult = await notificationService.sendSMS(customerPhone, smsMessage);
          notifications.push({
            type: 'sms',
            recipient: customerPhone,
            success: smsResult.success,
            error: smsResult.error
          });
          console.log('📱 Enquiry reply SMS sent:', smsResult.success ? 'Success' : smsResult.error);
        } catch (smsError) {
          notifications.push({
            type: 'sms',
            recipient: customerPhone,
            success: false,
            error: smsError.message
          });
        }
      }

      // Send WhatsApp
      if (customerPhone) {
        try {
          const whatsappResult = await notificationService.sendWhatsApp(customerPhone, whatsappMessage);
          notifications.push({
            type: 'whatsapp',
            recipient: customerPhone,
            success: whatsappResult.success,
            error: whatsappResult.error
          });
          console.log('💬 Enquiry reply WhatsApp sent:', whatsappResult.success ? 'Success' : whatsappResult.error);
        } catch (whatsappError) {
          notifications.push({
            type: 'whatsapp',
            recipient: customerPhone,
            success: false,
            error: whatsappError.message
          });
        }
      }

      console.log('📬 Enquiry reply notifications summary:', {
        total: notifications.length,
        successful: notifications.filter(n => n.success).length,
        failed: notifications.filter(n => !n.success).length
      });
    } catch (notificationError) {
      // Don't fail the reply if notifications fail
    }

    res.json({
      success: true,
      message: 'Reply sent successfully',
      data: enquiry
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to send reply',
      error: err.message
    });
  }
};

// Delete enquiry
export const deleteEnquiry = async (req, res) => {
  try {
    const { id } = req.params;

    const enquiry = await Enquiry.findByIdAndDelete(id);

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }

    res.json({
      success: true,
      message: 'Enquiry deleted successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete enquiry',
      error: err.message
    });
  }
};

// Get enquiry statistics
export const getEnquiryStats = async (req, res) => {
  try {
    const stats = await Enquiry.aggregate([
      {
        $facet: {
          totalEnquiries: [{ $count: 'count' }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } }
          ],
          newEnquiries: [
            { $match: { status: 'new' } },
            { $count: 'count' }
          ],
          resolvedEnquiries: [
            { $match: { status: { $in: ['resolved', 'closed'] } } },
            { $count: 'count' }
          ],
          todayEnquiries: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
              }
            },
            { $count: 'count' }
          ]
        }
      }
    ]);

    const result = stats[0];
    
    res.json({
      success: true,
      data: {
        total: result.totalEnquiries[0]?.count || 0,
        new: result.newEnquiries[0]?.count || 0,
        resolved: result.resolvedEnquiries[0]?.count || 0,
        today: result.todayEnquiries[0]?.count || 0,
        byStatus: result.byStatus || [],
        byType: result.byType || [],
        byPriority: result.byPriority || []
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enquiry statistics',
      error: err.message
    });
  }
};

// Bulk update enquiries
export const bulkUpdateEnquiries = async (req, res) => {
  try {
    const { enquiryIds, updateData } = req.body;

    if (!Array.isArray(enquiryIds) || enquiryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Enquiry IDs array is required'
      });
    }

    const result = await Enquiry.updateMany(
      { _id: { $in: enquiryIds } },
      { $set: updateData }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} enquiries updated successfully`,
      data: {
        modifiedCount: result.modifiedCount,
        total: enquiryIds.length
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update enquiries',
      error: err.message
    });
  }
};

