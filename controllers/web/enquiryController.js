import Enquiry from '../../models/enquiry.js';
import FAQ from '../../models/faq.js';

// Create a new enquiry (for frontend contact form)
export const createEnquiry = async (req, res) => {
  try {
    const { name, email, phone, message, subject, type, order, product } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Get user ID if authenticated
    const userId = req.user?.id || null;

    // Create enquiry
    const enquiry = await Enquiry.create({
      name,
      email,
      phone: phone || '',
      message,
      subject: subject || 'General Inquiry',
      type: type || 'general',
      user: userId,
      order: order || null,
      product: product || null,
      status: 'new'
    });

    res.status(201).json({
      success: true,
      message: 'Your enquiry has been submitted successfully. We will get back to you soon.',
      data: enquiry
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit enquiry',
      error: err.message
    });
  }
};

// Get user's enquiries (if authenticated)
export const getUserEnquiries = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const enquiries = await Enquiry.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('order', 'orderNumber')
      .populate('product', 'productName')
      .select('-internalNotes'); // Don't send internal notes to user

    res.json({
      success: true,
      data: enquiries
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enquiries',
      error: err.message
    });
  }
};

// Get FAQ questions (for chat support) - from database
export const getFAQQuestions = async (req, res) => {
  try {
    const { category, search } = req.query;
    
    // Build query
    let query = { isActive: true };
    
    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch FAQs from database
    const faqs = await FAQ.find(query)
      .sort({ order: 1, createdAt: -1 })
      .select('-createdBy -updatedBy -__v')
      .limit(100);

    res.json({
      success: true,
      data: faqs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch FAQ questions',
      error: err.message
    });
  }
};

