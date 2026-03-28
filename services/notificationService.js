import nodemailer from 'nodemailer';
import axios from 'axios';
import twilio from 'twilio';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import NotificationLog from '../models/notificationLog.js';
import { notificationConfig, validateNotificationConfig } from '../config/notification.config.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

class NotificationService {
  constructor() {
    // Email configuration
    try {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      console.log('✅ Email transporter configured successfully');
    } catch (error) {
      this.emailTransporter = null;
    }

    // Twilio configuration for SMS and WhatsApp
    try {
      // Validate Twilio credentials before initializing
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.warn('⚠️ Twilio credentials not fully configured');
        console.warn('- TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set');
        console.warn('- TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set');
        this.twilioClient = null;
        this.twilioPhoneNumber = null;
        this.twilioWhatsAppNumber = null;
        return;
      }
      
      console.log('🔧 Configuring Twilio with:', {
        accountSid: process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set',
        authToken: process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set',
        fromNumber: process.env.TWILIO_PHONE_NUMBER || 'Not set'
      });
      
      // Validate Account SID format (should start with 'AC')
      if (!process.env.TWILIO_ACCOUNT_SID.startsWith('AC') && !process.env.TWILIO_ACCOUNT_SID.startsWith('SK')) {
        console.warn('⚠️ TWILIO_ACCOUNT_SID format may be incorrect (should start with AC or SK)');
      }
      
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      
      this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
      // For Twilio WhatsApp sandbox, use the proper format
      this.twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER ? 
        `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}` : 
        (process.env.TWILIO_PHONE_NUMBER ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}` : null);
      console.log('✅ Twilio client configured successfully');
      console.log('📱 Twilio phone number set to:', this.twilioPhoneNumber);
      console.log('💬 Twilio WhatsApp number set to:', this.twilioWhatsAppNumber);
    } catch (error) {
      this.twilioClient = null;
      this.twilioPhoneNumber = null;
      this.twilioWhatsAppNumber = null;
    }
  }

  // Create notification log entry
  async createNotificationLog(order, type, recipient, subject, message, orderStatus, trackingNumber = null) {
    try {
      // Handle user ID properly
      let userId = null;
      if (order.user) {
        if (typeof order.user === 'object' && order.user._id) {
          userId = order.user._id;
        } else if (typeof order.user === 'string') {
          userId = order.user;
        }
      }
      
      // Only create log if we have a valid user ID
      if (!userId) {
        console.log('Skipping notification log - no valid user ID');
        return null;
      }

      const log = new NotificationLog({
        order: order._id,
        user: userId,
        type,
        recipient,
        subject,
        message,
        orderStatus,
        trackingNumber
      });
      await log.save();
      return log;
    } catch (error) {
      return null;
    }
  }

  // Update notification log status
  async updateNotificationLog(logId, status, error = null) {
    try {
      await NotificationLog.findByIdAndUpdate(logId, {
        status,
        error,
        sentAt: status === 'sent' ? new Date() : null
      });
    } catch (error) {
    }
  }

  // Send email notification
  async sendEmail(to, subject, htmlContent) {
    try {
      if (!this.emailTransporter) {
        console.log('❌ Email transporter not configured');
        return { success: false, error: 'Email transporter not configured' };
      }

      console.log('📧 Attempting to send email to:', to);
      console.log('📧 SMTP User:', process.env.SMTP_USER);
      console.log('📧 SMTP Host:', process.env.SMTP_HOST);
      console.log('📧 SMTP Port:', process.env.SMTP_PORT);
      console.log('📧 SMTP Pass:', process.env.SMTP_PASS ? 'Set' : 'Not set');
      console.log('📧 SMTP_FROM:', process.env.SMTP_FROM || 'Not set');
      console.log('📧 SMTP_FROM_EMAIL:', process.env.SMTP_FROM_EMAIL || 'Not set');

      // For SendGrid, SMTP_USER is 'apikey', so we MUST use SMTP_FROM or SMTP_FROM_EMAIL
      // Use SMTP_FROM or SMTP_FROM_EMAIL if available, otherwise use SMTP_USER (only if it's a valid email)
      let fromEmail = (process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || '').trim();
      
      // If SMTP_USER is 'apikey' (SendGrid), we must use SMTP_FROM
      if (process.env.SMTP_USER === 'apikey') {
        if (!fromEmail) {
          return { success: false, error: 'SMTP_FROM email address not configured. Please set SMTP_FROM or SMTP_FROM_EMAIL in your .env file' };
        }
      } else {
        // If SMTP_FROM is not set, use SMTP_USER (for non-SendGrid providers)
        if (!fromEmail) {
          fromEmail = (process.env.SMTP_USER || '').trim();
        }
      }
      
      // Final validation: fromEmail must be a valid email address
      if (!fromEmail || fromEmail === 'apikey' || !fromEmail.includes('@')) {
        return { success: false, error: `Invalid from email address: ${fromEmail || 'empty'}. Please set a valid SMTP_FROM or SMTP_FROM_EMAIL in your .env file` };
      }

      // Format from email properly for SendGrid
      // SendGrid requires: "Display Name" <email@domain.com> or just email@domain.com
      // Ensure it's a proper email format
      let formattedFrom = fromEmail.trim();
      
      // Extract email if it's in format "Name" <email@domain.com>
      let emailAddress = formattedFrom;
      const nameMatch = formattedFrom.match(/^"([^"]+)"\s*<([^>]+)>$/);
      if (nameMatch) {
        emailAddress = nameMatch[2];
      } else if (formattedFrom.includes('<') && formattedFrom.includes('>')) {
        const emailMatch = formattedFrom.match(/<([^>]+)>/);
        if (emailMatch) {
          emailAddress = emailMatch[1];
        }
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailAddress)) {
        return { success: false, error: `Invalid email format: ${emailAddress}. Please use a valid email address like noreply@yourdomain.com` };
      }
      
      // Use the clean email address (SendGrid prefers simple format)
      formattedFrom = emailAddress;

      // Final safety check - ensure formattedFrom is never empty
      if (!formattedFrom || !formattedFrom.trim() || !formattedFrom.includes('@')) {
        return { 
          success: false, 
          error: `Internal error: Invalid from email address. Please check your SMTP_FROM configuration. Current value: ${formattedFrom || 'empty'}` 
        };
      }

      const mailOptions = {
        from: formattedFrom.trim(),
        to: to,
        subject: subject,
        html: htmlContent,
        // Add proper headers for SendGrid
        headers: {
          'X-Mailer': 'Gupta Distributors Notification Service'
        }
      };
      
      console.log('📧 Using from email:', formattedFrom);
      console.log('📧 Final mailOptions.from value:', mailOptions.from);
      console.log('📧 mailOptions.from type:', typeof mailOptions.from);
      console.log('📧 mailOptions.from length:', mailOptions.from ? mailOptions.from.length : 0);
      console.log('📧 Mail options:', { 
        from: mailOptions.from, 
        to: mailOptions.to, 
        subject: mailOptions.subject,
        hasHtml: !!mailOptions.html
      });

      const result = await this.emailTransporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.log({
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });
      
      // Provide helpful error messages for common SendGrid errors
      if (error.responseCode === 550) {
        if (error.response && error.response.includes('From')) {
          return { 
            success: false, 
            error: `SendGrid error: Invalid 'From' email address. Please ensure SMTP_FROM is set to a verified email address in your SendGrid account. Current value: ${process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || 'Not set'}` 
          };
        }
        return { 
          success: false, 
          error: `SendGrid error (550): ${error.response || error.message}. Please verify your email configuration and that the sender email is verified in SendGrid.` 
        };
      }
      
      if (error.code === 'EAUTH') {
        return { 
          success: false, 
          error: 'Email authentication failed. Please verify your SMTP_USER and SMTP_PASS credentials.' 
        };
      }
      
      return { success: false, error: error.message || 'Failed to send email' };
    }
  }

  // Send SMS notification using Twilio
  async sendSMS(to, message) {
    try {
      console.log('📱 Attempting to send SMS to:', to);
      console.log('📱 Twilio client:', this.twilioClient ? 'Available' : 'Not available');
      console.log('📱 Twilio phone number:', this.twilioPhoneNumber || 'Not set');
      console.log('📱 Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 4)}...` : 'Not set');
      console.log('📱 Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set');
      
      if (!this.twilioClient || !this.twilioPhoneNumber) {
        console.log('❌ Twilio SMS service not configured');
        return { success: false, error: 'Twilio SMS service not configured. Please check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your .env file' };
      }
      
      // Validate Twilio credentials format
      if (process.env.TWILIO_ACCOUNT_SID && !process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
        console.warn('⚠️ TWILIO_ACCOUNT_SID format may be incorrect (should start with AC)');
      }

      // Format phone number for India (+91)
      const formattedNumber = to.startsWith('+91') ? to : `+91${to}`;
      console.log('📱 Formatted number:', formattedNumber);

      const result = await this.twilioClient.messages.create({
        body: message,
        from: this.twilioPhoneNumber,
        to: formattedNumber
      });

      console.log('✅ SMS sent successfully via Twilio:', result.sid);
      return { success: true, data: result };
    } catch (error) {
      console.log({
        code: error.code,
        message: error.message,
        status: error.status
      });
      
      // Provide helpful error message for authentication errors
      if (error.code === 20003 || error.status === 401) {
        return { 
          success: false, 
          error: 'Twilio authentication failed. Please verify your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file are correct' 
        };
      }
      
      return { success: false, error: error.message };
    }
  }

  // Send WhatsApp notification using Twilio
  async sendWhatsApp(to, message) {
    try {
      console.log('💬 Attempting to send WhatsApp to:', to);
      console.log('💬 Twilio client:', this.twilioClient ? 'Available' : 'Not available');
      console.log('💬 WhatsApp from number:', this.twilioWhatsAppNumber || 'Not set');
      console.log('💬 Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set');
      console.log('💬 Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set');
      
      if (!this.twilioClient || !this.twilioWhatsAppNumber) {
        console.log('❌ Twilio WhatsApp service not configured');
        return { success: false, error: 'Twilio WhatsApp service not configured' };
      }

      // Format phone number for WhatsApp sandbox
      let formattedNumber = to;
      
      // Clean the phone number
      if (to.startsWith('+91')) {
        formattedNumber = to.substring(3); // Remove +91
      } else if (to.startsWith('91')) {
        formattedNumber = to.substring(2); // Remove 91
      } else if (to.startsWith('0')) {
        formattedNumber = to.substring(1); // Remove leading 0
      }
      
      // Ensure we have a clean 10-digit number
      formattedNumber = formattedNumber.replace(/\D/g, ''); // Remove all non-digits
      
      // For Twilio WhatsApp sandbox, the recipient must be in the format: whatsapp:+91XXXXXXXXXX
      formattedNumber = `whatsapp:+91${formattedNumber}`;
      console.log('💬 Formatted WhatsApp number:', formattedNumber);
      console.log('💬 From number:', this.twilioWhatsAppNumber);

      const result = await this.twilioClient.messages.create({
        body: message,
        from: this.twilioWhatsAppNumber,
        to: formattedNumber
      });

      console.log('✅ WhatsApp message sent successfully via Twilio:', result.sid);
      return { success: true, data: result };
    } catch (error) {
      console.log({
        code: error.code,
        message: error.message,
        status: error.status
      });
      
      // Provide helpful error message for authentication errors
      if (error.code === 20003 || error.status === 401) {
        return { 
          success: false, 
          error: 'Twilio authentication failed. Please verify your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file are correct' 
        };
      }
      
      // Check if it's a sandbox issue
      if (error.message.includes('Invalid From and To pair')) {
        console.log('💡 WhatsApp Sandbox Issue: The recipient phone number needs to join the sandbox first.');
        console.log('💡 To join the sandbox, send "join <sandbox-code>" to +1 415 523 8886');
        console.log('💡 The sandbox code is usually the last part of your WhatsApp number');
      }
      
      return { success: false, error: error.message };
    }
  }

  // Generate order status message
  generateOrderStatusMessage(order, status, trackingNumber = null) {
    const orderId = order._id.toString().slice(-6).toUpperCase();
    const customerName = order.address.name;
    const total = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(order.total);

    let message = '';
    let subject = '';

    switch (status) {
      case 'pending':
        subject = `Order #${orderId} Placed Successfully - Thank you for your order!`;
        message = `Dear ${customerName},\n\nThank you for placing your order #${orderId}!\n\nOrder Total: ${total}\n\nWe have received your order and will process it shortly. You'll receive another notification once your order is confirmed and ready for shipping.\n\nThank you for shopping with us!`;
        break;

      case 'placed':
        subject = `Order #${orderId} Placed Successfully - Thank you for your order!`;
        message = `Dear ${customerName},\n\nThank you for placing your order #${orderId}!\n\nOrder Total: ${total}\n\nYour order has been successfully placed and payment has been processed. We will confirm your order shortly and begin processing it.\n\nThank you for shopping with us!`;
        break;

      case 'confirmed':
        subject = `Order #${orderId} Confirmed - Your order is being processed`;
        message = `Dear ${customerName},\n\nYour order #${orderId} has been confirmed and is being processed.\n\nOrder Total: ${total}\n\nWe'll notify you once your order is shipped.\n\nThank you for shopping with us!`;
        break;

      case 'shipped':
        subject = `Order #${orderId} Shipped - Your order is on its way`;
        message = `Dear ${customerName},\n\nGreat news! Your order #${orderId} has been shipped.\n\n${trackingNumber ? `Tracking Number: ${trackingNumber}\n` : ''}Order Total: ${total}\n\nYou can track your order using the tracking number above.\n\nThank you for shopping with us!`;
        break;

      case 'delivered':
        subject = `Order #${orderId} Delivered - Enjoy your purchase!`;
        message = `Dear ${customerName},\n\nYour order #${orderId} has been successfully delivered!\n\nOrder Total: ${total}\n\nWe hope you love your purchase. Please leave a review to help other customers.\n\nThank you for shopping with us!`;
        break;

      case 'cancelled':
        subject = `Order #${orderId} Cancelled`;
        message = `Dear ${customerName},\n\nYour order #${orderId} has been cancelled as requested.\n\nOrder Total: ${total}\n\nIf you have any questions, please contact our customer support.\n\nThank you for your understanding.`;
        break;

      case 'returned':
        subject = `Order #${orderId} Return Request Approved`;
        message = `Dear ${customerName},\n\nYour return request for order #${orderId} has been approved.\n\nOrder Total: ${total}\n\nWe will process your refund within 5-7 business days.\n\nThank you for your patience.`;
        break;

      case 'refunded':
        subject = `Order #${orderId} Refund Processed`;
        message = `Dear ${customerName},\n\nYour refund for order #${orderId} has been processed successfully.\n\nOrder Total: ${total}\nRefund Amount: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.refundAmount || order.total)}\n\nThe refund will be credited to your original payment method within 5-7 business days.\n\nThank you for your patience.`;
        break;

      default:
        subject = `Order #${orderId} Status Update`;
        message = `Dear ${customerName},\n\nYour order #${orderId} status has been updated to: ${status}\n\nOrder Total: ${total}\n\nThank you for shopping with us!`;
    }

    return { subject, message };
  }

  // Generate HTML email content
  generateEmailHTML(order, status, trackingNumber = null) {
    const orderId = order._id.toString().slice(-6).toUpperCase();
    const customerName = order.address.name;
    const total = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(order.total);

    let statusText = '';
    let statusColor = '';
    let icon = '';

    switch (status) {
      case 'pending':
        statusText = 'Order Placed';
        statusColor = '#F59E0B';
        icon = '📦';
        break;

      case 'placed':
        statusText = 'Order Placed';
        statusColor = '#10B981';
        icon = '✅';
        break;

      case 'confirmed':
        statusText = 'Order Confirmed';
        statusColor = '#3B82F6';
        icon = '✅';
        break;
      case 'shipped':
        statusText = 'Order Shipped';
        statusColor = '#8B5CF6';
        icon = '🚚';
        break;
      case 'delivered':
        statusText = 'Order Delivered';
        statusColor = '#10B981';
        icon = '🎉';
        break;
      case 'cancelled':
        statusText = 'Order Cancelled';
        statusColor = '#EF4444';
        icon = '❌';
        break;
      case 'returned':
        statusText = 'Return Approved';
        statusColor = '#F59E0B';
        icon = '🔄';
        break;
      case 'refunded':
        statusText = 'Refund Processed';
        statusColor = '#059669';
        icon = '💰';
        break;
      default:
        statusText = 'Status Updated';
        statusColor = '#6B7280';
        icon = '📋';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Status Update</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 20px auto; 
            background: white; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header { 
            background: #2563eb; 
            color: white; 
            padding: 25px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 24px; 
            font-weight: 600;
          }
          .header p { 
            margin: 5px 0 0 0; 
            opacity: 0.9; 
            font-size: 14px;
          }
          .content { 
            padding: 30px; 
          }
          .status-badge { 
            display: inline-block; 
            background: ${statusColor}; 
            color: white; 
            padding: 8px 16px; 
            border-radius: 6px; 
            font-weight: 500; 
            font-size: 14px;
            margin: 20px 0;
          }
          .order-details { 
            background: #f8fafc; 
            padding: 20px; 
            border-radius: 6px; 
            margin: 20px 0; 
            border: 1px solid #e2e8f0;
          }
          .order-details h3 { 
            margin: 0 0 15px 0; 
            color: #1e293b; 
            font-size: 16px;
          }
          .order-details p { 
            margin: 8px 0; 
            color: #475569;
          }
          .tracking-info { 
            background: #eff6ff; 
            padding: 15px; 
            border-radius: 6px; 
            margin: 15px 0; 
            border: 1px solid #dbeafe;
          }
          .tracking-info h4 { 
            margin: 0 0 10px 0; 
            color: #1e40af; 
            font-size: 14px;
          }
          .footer { 
            text-align: center; 
            margin-top: 30px; 
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #64748b; 
            font-size: 13px; 
          }
          .button { 
            display: inline-block; 
            background: #2563eb; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            margin: 10px 0; 
            font-weight: 500;
          }
          .button:hover { 
            background: #1d4ed8; 
          }
          .highlight { 
            color: #2563eb; 
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${status === 'pending' ? '🎉 Order Placed Successfully!' : `${icon} ${statusText}`}</h1>
            <p>${status === 'pending' ? 'Thank you for your order!' : `Order #${orderId}`}</p>
          </div>
          
          <div class="content">
            ${status === 'pending' ? `
              <p>Hello <span class="highlight">${customerName}</span>,</p>
              
              <p>Thank you for placing your order! We're excited to process it for you.</p>
              
              <div class="order-details">
                <h3>Order Details</h3>
                <p><strong>Order ID:</strong> #${orderId}</p>
                <p><strong>Subtotal:</strong> ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.subtotal || 0)}</p>
                ${order.discountAmount > 0 ? `<p><strong>Discount:</strong> -${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.discountAmount)}</p>` : ''}
                <p><strong>Shipping:</strong> FREE</p>
                <p><strong>Total Amount:</strong> ${total}</p>
                <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN')}</p>
                <p><strong>Payment Method:</strong> ${order.paymentMethod || 'Not specified'}</p>
              </div>
              
              <div style="background: #f0f9ff; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #bae6fd;">
                <h4 style="margin: 0 0 10px 0; color: #0c4a6e; font-size: 16px;">📋 What's Next?</h4>
                <ul style="margin: 0; padding-left: 20px; color: #0c4a6e;">
                  <li>We'll review and confirm your order within 24 hours</li>
                  <li>You'll receive a confirmation email once processed</li>
                  <li>We'll notify you when your order is ready to ship</li>
                </ul>
              </div>
            ` : `
              <p>Hello <span class="highlight">${customerName}</span>,</p>
              
              <p>Your order status has been updated to <span class="status-badge">${statusText}</span>.</p>
              
              <div class="order-details">
                <h3>Order Information</h3>
                <p><strong>Order ID:</strong> #${orderId}</p>
                <p><strong>Subtotal:</strong> ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.subtotal || 0)}</p>
                ${order.discountAmount > 0 ? `<p><strong>Discount:</strong> -${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.discountAmount)}</p>` : ''}
                <p><strong>Shipping:</strong> FREE</p>
                <p><strong>Total Amount:</strong> ${total}</p>
                <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN')}</p>
                ${trackingNumber ? `<p><strong>Tracking Number:</strong> ${trackingNumber}</p>` : ''}
                ${status === 'refunded' && order.refundAmount ? `<p><strong>Refund Amount:</strong> ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.refundAmount)}</p>` : ''}
              </div>
            `}
            
            ${trackingNumber ? `
            <div class="tracking-info">
              <h4>📦 Track Your Order</h4>
              <p>You can track your order using the tracking number: <strong>${trackingNumber}</strong></p>
            </div>
            ` : ''}
            
            <p>Thank you for choosing us!</p>
            
            <div class="footer">
              <p>Need help? Contact our support team</p>
              <p>© 2024 Gupta Distributors. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Send referral points notification
  async sendReferralPointsNotification(user, pointsAwarded, referrerName, orderId) {
    try {
      const subject = '🎉 Referral Points Awarded!';
      const message = `Congratulations! You've earned ${pointsAwarded} reward points for using ${referrerName}'s referral code on your first order.`;
      
      const htmlContent = this.generateReferralPointsEmailHTML(user, pointsAwarded, referrerName, orderId);
      
      const notifications = [];

      // Send email notification
      if (user.email) {
        const emailLog = await this.createNotificationLog(
          { _id: orderId, user: user._id }, 
          'email', 
          user.email, 
          subject, 
          message, 
          'referral_points'
        );
        
        const emailResult = await this.sendEmail(user.email, subject, htmlContent);
        
        if (emailLog) {
          await this.updateNotificationLog(emailLog._id, emailResult.success ? 'sent' : 'failed', emailResult.error);
        }
        
        notifications.push({
          type: 'email',
          success: emailResult.success,
          error: emailResult.error
        });
      }

      // Send SMS notification
      if (user.phone) {
        const smsLog = await this.createNotificationLog(
          { _id: orderId, user: user._id }, 
          'sms', 
          user.phone, 
          subject, 
          message, 
          'referral_points'
        );
        
        const smsResult = await this.sendSMS(user.phone, message);
        
        if (smsLog) {
          await this.updateNotificationLog(smsLog._id, smsResult.success ? 'sent' : 'failed', smsResult.error);
        }
        
        notifications.push({
          type: 'sms',
          success: smsResult.success,
          error: smsResult.error
        });
      }

      return notifications;
    } catch (error) {
      return [];
    }
  }

  // Generate referral points email HTML
  generateReferralPointsEmailHTML(user, pointsAwarded, referrerName, orderId) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Referral Points Awarded</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .points-box { background: #fff; border: 2px solid #4CAF50; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
          .points-number { font-size: 48px; font-weight: bold; color: #4CAF50; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Congratulations!</h1>
            <p>You've earned referral reward points!</p>
          </div>
          
          <div class="content">
            <h2>Hello ${user.name || user.displayName || 'there'}!</h2>
            
            <p>Great news! You've successfully earned <strong>${pointsAwarded} reward points</strong> for using <strong>${referrerName}'s</strong> referral code on your first order.</p>
            
            <div class="points-box">
              <div class="points-number">${pointsAwarded}</div>
              <p><strong>Reward Points Awarded</strong></p>
              <p>Order ID: #${orderId}</p>
            </div>
            
            <h3>What you can do with these points:</h3>
            <ul>
              <li>🎁 Redeem them for discounts on future purchases</li>
              <li>💰 1 point = ₹1 discount</li>
              <li>⏰ Valid for 6 months from today</li>
              <li>🛒 Use them on the cart page</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/cart" class="button">
                Start Shopping & Use Points
              </a>
            </div>
            
            <p><strong>Thank you for choosing us!</strong></p>
            
            <div class="footer">
              <p>If you have any questions about your reward points, please contact our customer support.</p>
              <p>© 2024 Gupta Distributors. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Send order status notifications
  async sendOrderStatusNotifications(order, status, trackingNumber = null) {
    try {
      console.log('🔔 Starting order status notifications for:', {
        orderId: order._id,
        status: status,
        trackingNumber: trackingNumber,
        userEmail: order.user?.email,
        userPhone: order.address?.mobile
      });
      
      // Validate input
      if (!order || !order.address) {
        return [];
      }
      
      // Check notification configuration
      console.log('🔧 Notification configuration check:');
      console.log('- Email enabled:', process.env.SMTP_USER && process.env.SMTP_PASS ? 'Yes' : 'No');
      console.log('- WhatsApp enabled:', process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'Yes' : 'No');
      console.log('- SMS enabled:', process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'Yes' : 'No');
      console.log('- SMTP User:', process.env.SMTP_USER ? 'Set' : 'Not set');
      console.log('- SMTP Pass:', process.env.SMTP_PASS ? 'Set' : 'Not set');
      console.log('- Twilio Account SID:', process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set');
      console.log('- Twilio Auth Token:', process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set');
      
      const { subject, message } = this.generateOrderStatusMessage(order, status, trackingNumber);
      const htmlContent = this.generateEmailHTML(order, status, trackingNumber);
      
      console.log('📧 Generated notification content:', { subject, messageLength: message.length });
      
      const notifications = [];

      // Send email notification (always attempt regardless of config)
      if (order.user && order.user.email) {
        try {
          console.log('📧 Attempting to send email to:', order.user.email);
          const emailLog = await this.createNotificationLog(order, 'email', order.user.email, subject, message, status, trackingNumber);
          
          const emailResult = await this.sendEmail(order.user.email, subject, htmlContent);
          
          if (emailLog) {
            await this.updateNotificationLog(emailLog._id, emailResult.success ? 'sent' : 'failed', emailResult.error);
          }
          
          notifications.push({
            type: 'email',
            success: emailResult.success,
            error: emailResult.error
          });
          
          console.log('📧 Email result:', emailResult);
        } catch (emailError) {
          notifications.push({
            type: 'email',
            success: false,
            error: emailError.message
          });
        }
      } else {
        console.log('No user email found for notification');
      }

      // Send SMS notification (always attempt regardless of config)
      if (order.address && order.address.mobile) {
        try {
          console.log('📱 Attempting to send SMS to:', order.address.mobile);
          const smsLog = await this.createNotificationLog(order, 'sms', order.address.mobile, subject, message, status, trackingNumber);
          
          const smsResult = await this.sendSMS(order.address.mobile, message);
          
          if (smsLog) {
            await this.updateNotificationLog(smsLog._id, smsResult.success ? 'sent' : 'failed', smsResult.error);
          }
          
          notifications.push({
            type: 'sms',
            success: smsResult.success,
            error: smsResult.error
          });
          
          console.log('📱 SMS result:', smsResult);
        } catch (smsError) {
          notifications.push({
            type: 'sms',
            success: false,
            error: smsError.message
          });
        }
      } else {
        console.log('No mobile number found for SMS notification');
      }

      // Send WhatsApp notification (always attempt regardless of config)
      if (order.address && order.address.mobile) {
        try {
          console.log('💬 Attempting to send WhatsApp to:', order.address.mobile);
          const whatsappLog = await this.createNotificationLog(order, 'whatsapp', order.address.mobile, subject, message, status, trackingNumber);
          const whatsappResult = await this.sendWhatsApp(order.address.mobile, message);
          
          if (whatsappLog) {
            await this.updateNotificationLog(whatsappLog._id, whatsappResult.success ? 'sent' : 'failed', whatsappResult.error);
          }
          
          notifications.push({
            type: 'whatsapp',
            success: whatsappResult.success,
            error: whatsappResult.error
          });
          
          console.log('💬 WhatsApp result:', whatsappResult);
        } catch (whatsappError) {
          notifications.push({
            type: 'whatsapp',
            success: false,
            error: whatsappError.message
          });
        }
      } else {
        console.log('No mobile number found for WhatsApp notification');
      }

      console.log('📊 Notification summary:', {
        total: notifications.length,
        successful: notifications.filter(n => n.success).length,
        failed: notifications.filter(n => !n.success).length,
        types: notifications.map(n => n.type)
      });
      
      // Always log a test notification message
      console.log('🎉 TEST NOTIFICATION: Order status notification triggered successfully!');
      console.log('📧 Would send email to:', order.user?.email);
      console.log('📱 Would send SMS to:', order.address?.mobile);
      console.log('💬 Would send WhatsApp to:', order.address?.mobile);
      
      return notifications;
    } catch (error) {
      console.log({
        message: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  // Generate stock alert message for SMS/WhatsApp
  generateStockAlertMessage(product, alertType) {
    const productName = product.productName;
    const currentStock = product.stock;
    const threshold = product.lowStockThreshold || 10;
    const category = product.category?.name || 'Unknown Category';
    const sku = product.sku || 'N/A';
    const price = product.price || 0;

    let message = '';
    let urgency = '';

    switch (alertType) {
      case 'out_of_stock':
        urgency = 'CRITICAL ALERT';
        message = `${urgency}\n\n`;
        message += `Product: ${productName}\n`;
        message += `SKU: ${sku}\n`;
        message += `Category: ${category}\n`;
        message += `Price: ₹${price.toLocaleString('en-IN')}\n`;
        message += `Status: OUT OF STOCK\n\n`;
        message += `IMMEDIATE ACTION REQUIRED\n`;
        message += `• Restock immediately\n`;
        message += `• Update inventory system\n`;
        message += `• Notify sales team\n\n`;
        message += `Alert Time: ${new Date().toLocaleString('en-IN')}\n`;
        message += `E-Commerce Management System`;
        break;

      case 'low_stock':
        urgency = 'LOW STOCK ALERT';
        message = `${urgency}\n\n`;
        message += `Product: ${productName}\n`;
        message += `SKU: ${sku}\n`;
        message += `Category: ${category}\n`;
        message += `Price: ₹${price.toLocaleString('en-IN')}\n`;
        message += `Current Stock: ${currentStock} units\n`;
        message += `Threshold: ${threshold} units\n\n`;
        message += `ACTION REQUIRED\n`;
        message += `• Review inventory levels\n`;
        message += `• Plan restock order\n`;
        message += `• Monitor sales closely\n\n`;
        message += `Alert Time: ${new Date().toLocaleString('en-IN')}\n`;
        message += `E-Commerce Management System`;
        break;

      case 'critical_stock':
        urgency = 'CRITICAL STOCK';
        message = `${urgency}\n\n`;
        message += `Product: ${productName}\n`;
        message += `SKU: ${sku}\n`;
        message += `Category: ${category}\n`;
        message += `Price: ₹${price.toLocaleString('en-IN')}\n`;
        message += `Current Stock: ${currentStock} units\n`;
        message += `Threshold: ${threshold} units\n\n`;
        message += `URGENT ACTION REQUIRED\n`;
        message += `• Restock immediately\n`;
        message += `• Contact supplier now\n`;
        message += `• Update stock levels\n`;
        message += `• Consider price adjustments\n\n`;
        message += `Alert Time: ${new Date().toLocaleString('en-IN')}\n`;
        message += `E-Commerce Management System`;
        break;

      default:
        message = `Stock Alert: ${productName}\nSKU: ${sku}\nStock: ${currentStock} units\n${new Date().toLocaleString('en-IN')}`;
    }

    return message;
  }

  // Generate stock alert email content
  generateStockAlertEmail(product, alertType) {
    const productName = product.productName;
    const currentStock = product.stock;
    const threshold = product.lowStockThreshold || 10;
    const category = product.category?.name || 'Unknown Category';
    const sku = product.sku || 'N/A';
    const price = product.price || 0;
    const discountPrice = product.discountPrice || 0;

    let alertTitle = '';
    let alertColor = '#f59e0b'; // Simple orange color
    let urgencyText = '';

    switch (alertType) {
      case 'out_of_stock':
        alertTitle = 'Out of Stock';
        urgencyText = 'Immediate action required';
        break;
      case 'low_stock':
        alertTitle = 'Low Stock Alert';
        urgencyText = 'Action required';
        break;
      case 'critical_stock':
        alertTitle = 'Critical Stock';
        urgencyText = 'Urgent action required';
        break;
      default:
        alertTitle = 'Stock Alert';
        urgencyText = 'Action required';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Stock Alert - ${productName}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
          }
          .email-container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header { 
            background: ${alertColor}; 
            color: white; 
            padding: 20px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 24px; 
            font-weight: 600;
          }
          .header p { 
            margin: 5px 0 0 0; 
            opacity: 0.9; 
            font-size: 14px;
          }
          .content { 
            padding: 30px; 
          }
          .product-info { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 6px; 
            margin: 20px 0; 
            border-left: 4px solid ${alertColor};
          }
          .product-name { 
            font-size: 20px; 
            font-weight: 600; 
            color: #333; 
            margin-bottom: 10px;
          }
          .stock-info { 
            display: flex; 
            align-items: center; 
            gap: 15px; 
            margin-bottom: 15px;
          }
          .stock-badge { 
            background: ${alertColor}; 
            color: white; 
            padding: 6px 12px; 
            border-radius: 4px; 
            font-weight: 500; 
            font-size: 14px;
          }
          .threshold-info { 
            color: #666; 
            font-size: 14px;
          }
          .product-details { 
            background: #f8f9fa; 
            border: 1px solid #e9ecef;
            border-radius: 6px; 
            padding: 20px; 
            margin: 20px 0; 
          }
          .product-details h3 { 
            color: #333; 
            font-size: 16px; 
            font-weight: 600; 
            margin-bottom: 15px;
          }
          .detail-row { 
            display: flex; 
            justify-content: space-between; 
            padding: 8px 0; 
            border-bottom: 1px solid #e9ecef;
          }
          .detail-row:last-child { 
            border-bottom: none; 
          }
          .detail-label { 
            font-weight: 500; 
            color: #666;
          }
          .detail-value { 
            color: #333;
          }
          .action-section { 
            background: #fff3cd; 
            border: 1px solid #ffeaa7; 
            border-radius: 6px; 
            padding: 20px; 
            margin: 20px 0;
          }
          .action-section h3 { 
            color: #856404; 
            font-size: 16px; 
            font-weight: 600; 
            margin-bottom: 10px;
          }
          .action-list { 
            list-style: none; 
            padding: 0;
            margin: 0;
          }
          .action-list li { 
            padding: 5px 0; 
            color: #856404;
            position: relative;
            padding-left: 20px;
          }
          .action-list li::before {
            content: '•';
            position: absolute;
            left: 0;
            color: #856404;
            font-weight: bold;
          }
          .footer { 
            background: #f8f9fa;
            border-top: 1px solid #e9ecef;
            padding: 20px; 
            text-align: center; 
            color: #666; 
            font-size: 12px; 
          }
          .footer p { 
            margin: 2px 0;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>${alertTitle}</h1>
            <p>${urgencyText}</p>
          </div>
          
          <div class="content">
            <div class="product-info">
              <div class="product-name">${productName}</div>
              <div class="stock-info">
                <span class="stock-badge">${currentStock} units left</span>
                <span class="threshold-info">Threshold: ${threshold} units</span>
              </div>
            </div>

            <div class="product-details">
              <h3>Product Information</h3>
              <div class="detail-row">
                <span class="detail-label">SKU:</span>
                <span class="detail-value">${sku}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Category:</span>
                <span class="detail-value">${category}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Price:</span>
                <span class="detail-value">₹${price.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div class="action-section">
              <h3>Action Required</h3>
              <ul class="action-list">
                <li>Review current inventory levels</li>
                <li>Place restock order with supplier</li>
                <li>Update stock levels in the system</li>
                <li>Notify sales team about low stock</li>
              </ul>
            </div>
          </div>

          <div class="footer">
            <p>E-Commerce Management System</p>
            <p>Generated on ${new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Get admin contacts
  async getAdminContacts() {
    try {
      const Admin = (await import('../models/admin.js')).default;
      const admins = await Admin.find({}, 'email');
      
      const emails = admins.map(admin => admin.email).filter(email => email);
      
      // Use hardcoded phone number for stock alerts
      const phones = ['9122389911']; // Default phone number for stock alerts
      const whatsappNumbers = phones; // Same numbers for WhatsApp
      
      return { emails, phones, whatsappNumbers };
    } catch (error) {
      return { emails: [], phones: ['9122389911'], whatsappNumbers: ['9122389911'] }; // Fallback phone number
    }
  }

  // Create stock alert log
  async createStockAlertLog(product, alertType, notifications) {
    try {
      const log = new NotificationLog({
        order: null,
        user: null,
        type: 'stock_alert',
        recipient: 'admin',
        subject: `Stock Alert: ${product.productName}`,
        message: this.generateStockAlertMessage(product, alertType),
        orderStatus: alertType,
        trackingNumber: null
      });
      await log.save();
      return log;
    } catch (error) {
      return null;
    }
  }
}

// Create and export a single instance
const notificationService = new NotificationService();

// Export the instance as default
export default notificationService;

// Export individual functions for backward compatibility
export const sendStockAlert = async (product, adminEmails, adminPhones) => {
  try {
    // Validate configuration
    const configErrors = validateNotificationConfig();
    if (configErrors.length > 0) {
      return false;
    }

    const alertMessage = `🚨 LOW STOCK ALERT 🚨\n\nProduct: ${product.productName}\nCurrent Stock: ${product.stock}\nThreshold: ${product.lowStockThreshold}\nSKU: ${product.sku || 'N/A'}\nCategory: ${product.category?.name || 'N/A'}\n\nPlease restock this product immediately!`;

    const results = [];

    // Send notifications based on priority order
    for (const method of notificationConfig.priority) {
      try {
        switch (method) {
          case 'email':
            if (notificationConfig.email.enabled && adminEmails && adminEmails.length > 0) {
              const emailResult = await sendStockAlertEmail(adminEmails, product, alertMessage);
              results.push({ method: 'email', success: emailResult });
            }
            break;
          
          case 'whatsapp':
            if (notificationConfig.whatsapp.enabled && adminPhones && adminPhones.length > 0) {
              const whatsappResult = await sendStockAlertWhatsApp(adminPhones, alertMessage);
              results.push({ method: 'whatsapp', success: whatsappResult });
            }
            break;
          
          case 'sms':
            if (notificationConfig.sms.enabled && adminPhones && adminPhones.length > 0) {
              const smsResult = await sendStockAlertSMS(adminPhones, alertMessage);
              results.push({ method: 'sms', success: smsResult });
            }
            break;
        }
      } catch (error) {
        results.push({ method, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Stock alert sent for product: ${product.productName} via ${successCount}/${results.length} methods`);
    
    return successCount > 0;
  } catch (error) {
    return false;
  }
};

// Check if stock alert should be sent
export const shouldSendStockAlert = (product) => {
  if (!product.stockAlertEnabled || !notificationConfig.stockAlert.enabled) {
    console.log(`❌ Stock alert disabled for product: ${product.productName} (enabled: ${product.stockAlertEnabled}, config: ${notificationConfig.stockAlert.enabled})`);
    return false;
  }
  
  // Check if stock is below threshold
  if (product.stock > product.lowStockThreshold) {
    console.log(`📦 Stock above threshold for product: ${product.productName} (stock: ${product.stock}, threshold: ${product.lowStockThreshold})`);
    return false;
  }
  
  // Check if alert was sent recently (within configured cooldown hours)
  if (product.lastStockAlertSent) {
    const lastAlertTime = new Date(product.lastStockAlertSent);
    const now = new Date();
    const hoursSinceLastAlert = (now - lastAlertTime) / (1000 * 60 * 60);
    
    console.log(`⏰ Checking cooldown for product: ${product.productName} (last alert: ${lastAlertTime.toISOString()}, hours since: ${hoursSinceLastAlert.toFixed(2)}, cooldown: ${notificationConfig.stockAlert.cooldownHours})`);
    
    if (hoursSinceLastAlert < notificationConfig.stockAlert.cooldownHours) {
      console.log(`🚫 Alert blocked by cooldown for product: ${product.productName} (${hoursSinceLastAlert.toFixed(2)}h < ${notificationConfig.stockAlert.cooldownHours}h)`);
      return false;
    }
  } else {
    console.log(`✅ No previous alert found for product: ${product.productName} - sending first alert`);
  }
  
  console.log(`✅ Alert approved for product: ${product.productName} (stock: ${product.stock}, threshold: ${product.lowStockThreshold})`);
  return true;
};

// Get admin contact information
export const getAdminContacts = async () => {
  try {
    // Fetch admin users from database
    const Admin = (await import('../models/admin.js')).default;
    const admins = await Admin.find({}, 'email');
    
    const emails = admins.map(admin => admin.email).filter(email => email);
    
    // Use hardcoded phone number for stock alerts
    const phones = ['9122389911']; // Default phone number for stock alerts
    
    return { emails, phones };
  } catch (error) {
    return { emails: [], phones: ['9122389911'] }; // Fallback phone number
  }
};

// Enhanced Stock Alert Notifications
export const sendStockAlertNotification = async (product, alertType = 'low_stock') => {
  try {
    const { emails, phones, whatsappNumbers } = await notificationService.getAdminContacts();
    const notifications = [];

    // Prepare alert message
    const alertMessage = notificationService.generateStockAlertMessage(product, alertType);
    const emailSubject = `🚨 Stock Alert: ${product.productName}`;
    const emailContent = notificationService.generateStockAlertEmail(product, alertType);

    // Send email notifications
    if (emails.length > 0) {
      for (const email of emails) {
        const emailResult = await notificationService.sendEmail(email, emailSubject, emailContent);
        notifications.push({
          type: 'email',
          recipient: email,
          success: emailResult.success,
          error: emailResult.error
        });
      }
    }

    // Send SMS notifications
    if (phones.length > 0) {
      for (const phone of phones) {
        const smsResult = await notificationService.sendSMS(phone, alertMessage);
        notifications.push({
          type: 'sms',
          recipient: phone,
          success: smsResult.success,
          error: smsResult.error
        });
      }
    }

    // Send WhatsApp notifications
    if (whatsappNumbers.length > 0) {
      for (const whatsapp of whatsappNumbers) {
        const whatsappResult = await notificationService.sendWhatsApp(whatsapp, alertMessage);
        notifications.push({
          type: 'whatsapp',
          recipient: whatsapp,
          success: whatsappResult.success,
          error: whatsappResult.error
        });
      }
    }

    // Log the notification
    await notificationService.createStockAlertLog(product, alertType, notifications);

    return {
      success: true,
      notifications,
      totalSent: notifications.filter(n => n.success).length,
      totalFailed: notifications.filter(n => !n.success).length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Generate stock alert message for SMS/WhatsApp
export const generateStockAlertMessage = (product, alertType) => {
  return notificationService.generateStockAlertMessage(product, alertType);
};

// Generate stock alert email content
export const generateStockAlertEmail = (product, alertType) => {
  return notificationService.generateStockAlertEmail(product, alertType);
};

// Send Pre-Order Notifications
export const sendPreOrderNotification = async (notification, product, type = 'registered') => {
  try {
    const { name, email, phone, notificationChannels } = notification;
    const notifications = [];

    let emailSubject = '';
    let emailContent = '';
    let smsMessage = '';
    let whatsappMessage = '';

    if (type === 'registered') {
      // Initial notification when user registers for pre-order
      emailSubject = `Pre-Order Confirmation: ${product.productName}`;
      
      // Build notification channels list
      const channels = [];
      if (notificationChannels.email) channels.push('Email');
      if (notificationChannels.sms) channels.push('SMS');
      if (notificationChannels.whatsapp) channels.push('WhatsApp');
      const channelsText = channels.length > 0 ? channels.join(', ') : 'Email';
      
      emailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">Pre-Order Confirmed</h1>
                      <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Thank you for your interest!</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">Dear ${name},</p>
                      
                      <p style="margin: 0 0 20px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                        We are delighted to confirm that your pre-order request for <strong style="color: #333333;">${product.productName}</strong> has been successfully registered.
                      </p>
                      
                      <p style="margin: 0 0 30px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                        You will receive notifications via <strong style="color: #667eea;">${channelsText}</strong> as soon as this product becomes available for purchase.
                      </p>
                      
                      <!-- Product Details Card -->
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 0 0 30px 0;">
                        <tr>
                          <td>
                            <h3 style="margin: 0 0 15px 0; color: #333333; font-size: 18px; font-weight: 600;">Product Details</h3>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                              <tr>
                                <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 120px;"><strong>Product:</strong></td>
                                <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 500;">${product.productName}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 20px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                        We appreciate your patience and will notify you immediately once the product is available in stock.
                      </p>
                      
                      <p style="margin: 0; color: #555555; font-size: 15px; line-height: 1.6;">
                        If you have any questions or need assistance, please feel free to contact our customer support team.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 10px 0; color: #666666; font-size: 14px;">Best regards,</p>
                      <p style="margin: 0; color: #333333; font-size: 16px; font-weight: 600;">E-Commerce Team</p>
                      <p style="margin: 15px 0 0 0; color: #999999; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      
      smsMessage = `Pre-Order Confirmed!\n\n${product.productName}\n\nWe'll notify you via ${channelsText} when this product becomes available. Thank you for your interest!`;
      
      whatsappMessage = `*Pre-Order Confirmed* ✅\n\nDear ${name},\n\nThank you for your interest in *${product.productName}*!\n\nYour pre-order has been successfully registered. We will notify you via ${channelsText} as soon as this product becomes available.\n\n*Product Details:*\n• Product: ${product.productName}\n\nWe appreciate your patience and will notify you immediately once the product is in stock.\n\nBest regards,\nE-Commerce Team`;
    } else if (type === 'available') {
      // Notification when product becomes available
      emailSubject = `Product Now Available: ${product.productName}`;
      
      const productUrl = `${process.env.FRONTEND_URL || 'https://yourwebsite.com'}/product/${product._id}`;
      
      emailContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">Product Available Now!</h1>
                      <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">Great news for you</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="margin: 0 0 20px 0; color: #333333; font-size: 16px; line-height: 1.6;">Dear ${name},</p>
                      
                      <p style="margin: 0 0 20px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                        We are excited to inform you that <strong style="color: #333333;">${product.productName}</strong> is now available for purchase!
                      </p>
                      
                      <p style="margin: 0 0 30px 0; color: #555555; font-size: 15px; line-height: 1.6;">
                        As you had registered for a pre-order, we wanted to notify you first. Don't miss out on this opportunity!
                      </p>
                      
                      <!-- Product Details Card -->
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 6px; padding: 20px; margin: 0 0 30px 0;">
                        <tr>
                          <td>
                            <h3 style="margin: 0 0 15px 0; color: #333333; font-size: 18px; font-weight: 600;">Product Details</h3>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                              <tr>
                                <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 120px;"><strong>Product:</strong></td>
                                <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 500;">${product.productName}</td>
                              </tr>
                              <tr>
                                <td style="padding: 8px 0; color: #666666; font-size: 14px;"><strong>Status:</strong></td>
                                <td style="padding: 8px 0; color: #10b981; font-size: 14px; font-weight: 600;">✓ In Stock</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- CTA Button -->
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">Shop Now</a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 0 0 10px 0; color: #ef4444; font-size: 14px; font-weight: 500; text-align: center;">
                        ⚡ Limited stock available - Order now to secure your product!
                      </p>
                      
                      <p style="margin: 20px 0 0 0; color: #555555; font-size: 15px; line-height: 1.6;">
                        If you have any questions or need assistance, our customer support team is here to help.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0 0 10px 0; color: #666666; font-size: 14px;">Best regards,</p>
                      <p style="margin: 0; color: #333333; font-size: 16px; font-weight: 600;">E-Commerce Team</p>
                      <p style="margin: 15px 0 0 0; color: #999999; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      
      smsMessage = `Great News! 🎉\n\n${product.productName} is now available!\n\nShop now: ${productUrl}\n\nLimited stock - Order now!`;
      
      whatsappMessage = `*Product Available Now!* 🎉\n\nDear ${name},\n\nWe're excited to inform you that *${product.productName}* is now available for purchase!\n\nAs you had registered for a pre-order, we wanted to notify you first.\n\n*Product Details:*\n• Product: ${product.productName}\n• Status: ✓ In Stock\n\n⚡ *Limited stock available - Order now to secure your product!*\n\nShop now: ${productUrl}\n\nBest regards,\nE-Commerce Team`;
    }

    // Send Email
    if (notificationChannels.email && email) {
      const emailResult = await notificationService.sendEmail(email, emailSubject, emailContent);
      notifications.push({
        type: 'email',
        recipient: email,
        success: emailResult.success,
        error: emailResult.error
      });
    }

    // Send SMS
    if (notificationChannels.sms && phone) {
      const smsResult = await notificationService.sendSMS(phone, smsMessage);
      notifications.push({
        type: 'sms',
        recipient: phone,
        success: smsResult.success,
        error: smsResult.error
      });
    }

    // Send WhatsApp
    if (notificationChannels.whatsapp && phone) {
      const whatsappResult = await notificationService.sendWhatsApp(phone, whatsappMessage);
      notifications.push({
        type: 'whatsapp',
        recipient: phone,
        success: whatsappResult.success,
        error: whatsappResult.error
      });
    }

    return {
      success: notifications.some(n => n.success),
      notifications,
      totalSent: notifications.filter(n => n.success).length,
      totalFailed: notifications.filter(n => !n.success).length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}; 