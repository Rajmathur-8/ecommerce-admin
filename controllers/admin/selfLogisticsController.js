import SelfLogistics from '../../models/selfLogistics.js';

// Get all self logistics
export const getAllSelfLogistics = async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 100 } = req.query;
    
    const query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Active filter
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else {
      // Default to only active ones
      query.isActive = true;
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const selfLogistics = await SelfLogistics.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await SelfLogistics.countDocuments(query);
    
    res.json({
      success: true,
      data: selfLogistics,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch self logistics', 
      error: error.message 
    });
  }
};

// Get self logistics by ID
export const getSelfLogisticsById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const selfLogistics = await SelfLogistics.findById(id);
    
    if (!selfLogistics) {
      return res.status(404).json({
        success: false,
        message: 'Self logistics not found'
      });
    }
    
    res.json({
      success: true,
      data: selfLogistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch self logistics',
      error: error.message
    });
  }
};

// Create new self logistics
export const createSelfLogistics = async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    
    // Validation
    if (!name || !email || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, and address are required'
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    // Check if email already exists
    const existing = await SelfLogistics.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Self logistics with this email already exists'
      });
    }
    
    const selfLogistics = await SelfLogistics.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      address: address.trim(),
      isActive: true
    });
    
    res.status(201).json({
      success: true,
      message: 'Self logistics created successfully',
      data: selfLogistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create self logistics',
      error: error.message
    });
  }
};

// Update self logistics
export const updateSelfLogistics = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, isActive } = req.body;
    
    const selfLogistics = await SelfLogistics.findById(id);
    
    if (!selfLogistics) {
      return res.status(404).json({
        success: false,
        message: 'Self logistics not found'
      });
    }
    
    // Email validation if email is being updated
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
      
      // Check if email already exists (excluding current record)
      const existing = await SelfLogistics.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: id }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Self logistics with this email already exists'
        });
      }
    }
    
    // Update fields
    if (name) selfLogistics.name = name.trim();
    if (email) selfLogistics.email = email.toLowerCase().trim();
    if (phone) selfLogistics.phone = phone.trim();
    if (address) selfLogistics.address = address.trim();
    if (isActive !== undefined) selfLogistics.isActive = isActive;
    
    await selfLogistics.save();
    
    res.json({
      success: true,
      message: 'Self logistics updated successfully',
      data: selfLogistics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update self logistics',
      error: error.message
    });
  }
};

// Delete self logistics
export const deleteSelfLogistics = async (req, res) => {
  try {
    const { id } = req.params;
    
    const selfLogistics = await SelfLogistics.findByIdAndDelete(id);
    
    if (!selfLogistics) {
      return res.status(404).json({
        success: false,
        message: 'Self logistics not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Self logistics deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete self logistics',
      error: error.message
    });
  }
};

