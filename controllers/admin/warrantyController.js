import Warranty from '../../models/warranty.js';
import Product from '../../models/product.js';
import Order from '../../models/order.js';

// Get all warranties
export const getAllWarranties = async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 10 } = req.query;
    
    const query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Active filter
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const warranties = await Warranty.find(query)
      .populate('applicableProducts', 'productName price discountPrice images')
      .populate('applicableCategories', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await Warranty.countDocuments(query);
    
    res.json({
      success: true,
      data: warranties,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch warranties', error: error.message });
  }
};

// Get warranty by ID
export const getWarrantyById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const warranty = await Warranty.findById(id)
      .populate('applicableProducts', 'productName price discountPrice images')
      .populate('applicableCategories', 'name');
    
    if (!warranty) {
      return res.status(404).json({ success: false, message: 'Warranty not found' });
    }
    
    res.json({ success: true, data: warranty });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch warranty', error: error.message });
  }
};

// Create warranty
export const createWarranty = async (req, res) => {
  try {
    const {
      name,
      description,
      duration,
      price,
      coverage,
      applicableProducts,
      applicableCategories,
      isActive,
      termsAndConditions,
      image
    } = req.body;
    
    // Validation
    if (!name || !duration || price === undefined) {
      return res.status(400).json({ success: false, message: 'Name, duration, and price are required' });
    }
    
    if (duration < 1) {
      return res.status(400).json({ success: false, message: 'Duration must be at least 1 month' });
    }
    
    if (price < 0) {
      return res.status(400).json({ success: false, message: 'Price cannot be negative' });
    }
    
    const warranty = await Warranty.create({
      name,
      description: description || '',
      duration: parseInt(duration),
      price: parseFloat(price),
      coverage: Array.isArray(coverage) ? coverage : [],
      applicableProducts: Array.isArray(applicableProducts) ? applicableProducts : [],
      applicableCategories: Array.isArray(applicableCategories) ? applicableCategories : [],
      isActive: isActive !== undefined ? isActive : true,
      termsAndConditions: termsAndConditions || '',
      image: image || ''
    });
    
    res.status(201).json({ success: true, data: warranty });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create warranty', error: error.message });
  }
};

// Update warranty
export const updateWarranty = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      duration,
      price,
      coverage,
      applicableProducts,
      applicableCategories,
      isActive,
      termsAndConditions,
      image
    } = req.body;
    
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (duration !== undefined) {
      if (duration < 1) {
        return res.status(400).json({ success: false, message: 'Duration must be at least 1 month' });
      }
      updateData.duration = parseInt(duration);
    }
    if (price !== undefined) {
      if (price < 0) {
        return res.status(400).json({ success: false, message: 'Price cannot be negative' });
      }
      updateData.price = parseFloat(price);
    }
    if (coverage !== undefined) updateData.coverage = Array.isArray(coverage) ? coverage : [];
    if (applicableProducts !== undefined) updateData.applicableProducts = Array.isArray(applicableProducts) ? applicableProducts : [];
    if (applicableCategories !== undefined) updateData.applicableCategories = Array.isArray(applicableCategories) ? applicableCategories : [];
    if (isActive !== undefined) updateData.isActive = isActive;
    if (termsAndConditions !== undefined) updateData.termsAndConditions = termsAndConditions;
    if (image !== undefined) updateData.image = image;
    
    const warranty = await Warranty.findByIdAndUpdate(id, updateData, { new: true })
      .populate('applicableProducts', 'productName price discountPrice images')
      .populate('applicableCategories', 'name');
    
    if (!warranty) {
      return res.status(404).json({ success: false, message: 'Warranty not found' });
    }
    
    res.json({ success: true, data: warranty });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update warranty', error: error.message });
  }
};

// Delete warranty
export const deleteWarranty = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if warranty is used in any orders
    const ordersWithWarranty = await Order.countDocuments({
      'items.warranty': id
    });
    
    if (ordersWithWarranty > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete warranty. It is used in ${ordersWithWarranty} order(s).`
      });
    }
    
    const warranty = await Warranty.findByIdAndDelete(id);
    
    if (!warranty) {
      return res.status(404).json({ success: false, message: 'Warranty not found' });
    }
    
    res.json({ success: true, message: 'Warranty deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete warranty', error: error.message });
  }
};

// Get warranties with stats (usage count, revenue, etc.)
export const getWarrantiesWithStats = async (req, res) => {
  try {
    const warranties = await Warranty.find()
      .populate('applicableProducts', 'productName')
      .populate('applicableCategories', 'name')
      .sort({ createdAt: -1 });
    
    // Get stats for each warranty
    const warrantiesWithStats = await Promise.all(
      warranties.map(async (warranty) => {
        // Count orders with this warranty
        const usageCount = await Order.countDocuments({
          'items.warranty': warranty._id
        });
        
        // Calculate total revenue from this warranty
        const orders = await Order.find({
          'items.warranty': warranty._id
        });
        
        let totalRevenue = 0;
        orders.forEach(order => {
          order.items.forEach(item => {
            if (item.warranty && item.warranty.toString() === warranty._id.toString()) {
              totalRevenue += warranty.price;
            }
          });
        });
        
        return {
          ...warranty.toObject(),
          usageCount,
          totalRevenue
        };
      })
    );
    
    res.json({ success: true, data: warrantiesWithStats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch warranties with stats', error: error.message });
  }
};

