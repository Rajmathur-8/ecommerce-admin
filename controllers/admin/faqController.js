import FAQ from '../../models/faq.js';

// Get all FAQs with filters
export const getAllFAQs = async (req, res) => {
  try {
    const {
      category,
      isActive,
      search,
      page = 1,
      limit = 20,
      sortBy = 'order',
      sortOrder = 'asc'
    } = req.query;

    // Build query
    let query = {};

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Active status filter
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Search filter
    if (search) {
      query.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } }
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
    const faqs = await FAQ.find(query)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await FAQ.countDocuments(query);

    res.json({
      success: true,
      data: faqs,
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
      message: 'Failed to fetch FAQs',
      error: err.message
    });
  }
};

// Get FAQ by ID
export const getFAQById = async (req, res) => {
  try {
    const { id } = req.params;

    const faq = await FAQ.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    res.json({
      success: true,
      data: faq
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch FAQ',
      error: err.message
    });
  }
};

// Create new FAQ
export const createFAQ = async (req, res) => {
  try {
    const { question, answer, category, isActive, order, tags } = req.body;
    const adminId = req.user.id;

    // Validation
    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: 'Question and answer are required'
      });
    }

    // Get max order value if order not provided
    let faqOrder = order;
    if (!faqOrder && faqOrder !== 0) {
      const maxOrderFAQ = await FAQ.findOne().sort({ order: -1 });
      faqOrder = maxOrderFAQ ? (maxOrderFAQ.order + 1) : 0;
    }

    const faq = await FAQ.create({
      question,
      answer,
      category: category || 'general',
      isActive: isActive !== undefined ? isActive : true,
      order: faqOrder,
      tags: tags || [],
      createdBy: adminId,
      updatedBy: adminId
    });

    const populatedFAQ = await FAQ.findById(faq._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'FAQ created successfully',
      data: populatedFAQ
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to create FAQ',
      error: err.message
    });
  }
};

// Update FAQ
export const updateFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, isActive, order, tags } = req.body;
    const adminId = req.user.id;

    const updateData = {
      updatedBy: adminId
    };

    if (question !== undefined) updateData.question = question;
    if (answer !== undefined) updateData.answer = answer;
    if (category !== undefined) updateData.category = category;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;
    if (tags !== undefined) updateData.tags = tags;

    const faq = await FAQ.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    res.json({
      success: true,
      message: 'FAQ updated successfully',
      data: faq
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update FAQ',
      error: err.message
    });
  }
};

// Delete FAQ
export const deleteFAQ = async (req, res) => {
  try {
    const { id } = req.params;

    const faq = await FAQ.findByIdAndDelete(id);

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    res.json({
      success: true,
      message: 'FAQ deleted successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete FAQ',
      error: err.message
    });
  }
};

// Toggle FAQ active status
export const toggleFAQStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const faq = await FAQ.findById(id);

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    faq.isActive = !faq.isActive;
    faq.updatedBy = adminId;
    await faq.save();

    const populatedFAQ = await FAQ.findById(faq._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.json({
      success: true,
      message: `FAQ ${faq.isActive ? 'activated' : 'deactivated'} successfully`,
      data: populatedFAQ
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to toggle FAQ status',
      error: err.message
    });
  }
};

// Reorder FAQs
export const reorderFAQs = async (req, res) => {
  try {
    const { faqOrders } = req.body; // Array of { id, order }

    if (!Array.isArray(faqOrders) || faqOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'FAQ orders array is required'
      });
    }

    const adminId = req.user.id;
    const updatePromises = faqOrders.map(({ id, order }) =>
      FAQ.findByIdAndUpdate(id, { order, updatedBy: adminId })
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'FAQs reordered successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to reorder FAQs',
      error: err.message
    });
  }
};

// Get FAQ statistics
export const getFAQStats = async (req, res) => {
  try {
    const stats = await FAQ.aggregate([
      {
        $facet: {
          totalFAQs: [{ $count: 'count' }],
          activeFAQs: [{ $match: { isActive: true } }, { $count: 'count' }],
          inactiveFAQs: [{ $match: { isActive: false } }, { $count: 'count' }],
          byCategory: [
            { $group: { _id: '$category', count: { $sum: 1 } } }
          ],
          recentFAQs: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
              $project: {
                question: 1,
                category: 1,
                isActive: 1,
                createdAt: 1
              }
            }
          ]
        }
      }
    ]);

    const result = stats[0];

    res.json({
      success: true,
      data: {
        total: result.totalFAQs[0]?.count || 0,
        active: result.activeFAQs[0]?.count || 0,
        inactive: result.inactiveFAQs[0]?.count || 0,
        byCategory: result.byCategory || [],
        recent: result.recentFAQs || []
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch FAQ statistics',
      error: err.message
    });
  }
};

// Bulk delete FAQs
export const bulkDeleteFAQs = async (req, res) => {
  try {
    const { faqIds } = req.body;

    if (!Array.isArray(faqIds) || faqIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'FAQ IDs array is required'
      });
    }

    const result = await FAQ.deleteMany({ _id: { $in: faqIds } });

    res.json({
      success: true,
      message: `${result.deletedCount} FAQs deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
        total: faqIds.length
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete FAQs',
      error: err.message
    });
  }
};

// Bulk update FAQ status
export const bulkUpdateFAQStatus = async (req, res) => {
  try {
    const { faqIds, isActive } = req.body;

    if (!Array.isArray(faqIds) || faqIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'FAQ IDs array is required'
      });
    }

    if (isActive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'isActive status is required'
      });
    }

    const adminId = req.user.id;
    const result = await FAQ.updateMany(
      { _id: { $in: faqIds } },
      { isActive, updatedBy: adminId }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} FAQs updated successfully`,
      data: {
        modifiedCount: result.modifiedCount,
        total: faqIds.length
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update FAQ status',
      error: err.message
    });
  }
};

