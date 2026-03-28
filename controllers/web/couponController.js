import Coupon from '../../models/coupon.js';

// Create a new coupon
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      type,
      value,
      minimumAmount,
      maximumDiscount,
      usageLimit,
      validFrom,
      validUntil,
      isActive,
      isFlashSale,
      flashSaleStart,
      flashSaleEnd,
      applicableCategories,
      applicableProducts,
      isFirstTimeUser
    } = req.body;

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    // Validate minimum amount
    if (minimumAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount cannot be negative'
      });
    }

    // Validate value based on type
    if (type === 'percentage' && (value < 0 || value > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage value must be between 0 and 100'
      });
    }

    if (type === 'fixed' && value < 0) {
      return res.status(400).json({
        success: false,
        message: 'Fixed value cannot be negative'
      });
    }

    // Validate fixed coupon value against minimum amount
    if (type === 'fixed' && value > minimumAmount) {
      return res.status(400).json({
        success: false,
        message: 'Fixed coupon value cannot be greater than minimum amount'
      });
    }

    // Validate flash sale dates
    if (flashSaleStart || flashSaleEnd) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of today
      
      if (flashSaleStart) {
        const startDate = new Date(flashSaleStart);
        if (startDate < today) {
          return res.status(400).json({
            success: false,
            message: 'Flash sale start date cannot be in the past'
          });
        }
      }
      
      if (flashSaleStart && flashSaleEnd) {
        const startDate = new Date(flashSaleStart);
        const endDate = new Date(flashSaleEnd);
        if (endDate < startDate) {
          return res.status(400).json({
            success: false,
            message: 'Flash sale end date cannot be before start date'
          });
        }
      }
    }

    let image = '';
    if (req.imageUrls && req.imageUrls.image) {
      image = req.imageUrls.image;
    } else if (req.body.image) {
      image = req.body.image;
    }

    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    const coupon = new Coupon({
      code: code.toUpperCase(),
      description,
      type,
      value,
      minimumAmount: minimumAmount || 0,
      maximumDiscount,
      usageLimit,
      validFrom: validFrom || new Date(),
      validUntil,
      isActive: isActive !== undefined ? isActive : true,
      isFlashSale: isFlashSale || false,
      flashSaleStart: flashSaleStart ? new Date(flashSaleStart + 'T00:00:00.000Z') : undefined,
      flashSaleEnd: flashSaleEnd ? new Date(flashSaleEnd + 'T23:59:59.999Z') : undefined,
      image, // Always use the processed image URL
      applicableCategories,
      applicableProducts,
      isFirstTimeUser: isFirstTimeUser || false
    });

    await coupon.save();

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon',
      error: error.message
    });
  }
};

// Get all coupons
export const getCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 10, isActive, type } = req.query;
    
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    if (type) {
      query.type = type;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };

    const coupons = await Coupon.find(query)
      .populate('applicableCategories', 'name')
      .populate('applicableProducts', 'productName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Coupon.countDocuments(query);

    res.json({
      success: true,
      data: coupons,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
      error: error.message
    });
  }
};

// Get coupon by ID
export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id)
      .populate('applicableCategories', 'name')
      .populate('applicableProducts', 'productName');

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      data: coupon
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon',
      error: error.message
    });
  }
};

// Update coupon
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const rawData = req.body;
    
    // Parse FormData fields (all come as strings from FormData)
    const updateData = {};
    
    // Handle string fields
    if (rawData.code !== undefined && rawData.code !== '') {
      updateData.code = rawData.code.toUpperCase();
    }
    if (rawData.description !== undefined) {
      updateData.description = rawData.description;
    }
    if (rawData.type !== undefined) {
      updateData.type = rawData.type;
    }
    
    // Parse numeric fields
    if (rawData.value !== undefined && rawData.value !== '') {
      updateData.value = Number(rawData.value);
    }
    if (rawData.minimumAmount !== undefined && rawData.minimumAmount !== '') {
      updateData.minimumAmount = Number(rawData.minimumAmount);
    }
    if (rawData.maximumDiscount !== undefined && rawData.maximumDiscount !== '') {
      updateData.maximumDiscount = Number(rawData.maximumDiscount);
    }
    if (rawData.usageLimit !== undefined && rawData.usageLimit !== '') {
      updateData.usageLimit = Number(rawData.usageLimit);
    }
    
    // Parse boolean fields
    if (rawData.isActive !== undefined) {
      updateData.isActive = rawData.isActive === 'true' || rawData.isActive === true;
    }
    if (rawData.isFlashSale !== undefined) {
      updateData.isFlashSale = rawData.isFlashSale === 'true' || rawData.isFlashSale === true;
    }
    
    // Handle date fields (only if not empty)
    if (rawData.flashSaleStart !== undefined && rawData.flashSaleStart !== '') {
      updateData.flashSaleStart = rawData.flashSaleStart;
    }
    if (rawData.flashSaleEnd !== undefined && rawData.flashSaleEnd !== '') {
      updateData.flashSaleEnd = rawData.flashSaleEnd;
    }

    // If code is being updated, check for uniqueness
    if (updateData.code) {
      const existingCoupon = await Coupon.findOne({
        code: updateData.code.toUpperCase(),
        _id: { $ne: id }
      });
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists'
        });
      }
    }

    // Validate minimum amount
    if (updateData.minimumAmount !== undefined && updateData.minimumAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount cannot be negative'
      });
    }

    // Validate value based on type
    if (updateData.type === 'percentage' && updateData.value !== undefined) {
      if (isNaN(updateData.value) || updateData.value < 0 || updateData.value > 100) {
        return res.status(400).json({
          success: false,
          message: 'Percentage value must be between 0 and 100'
        });
      }
    }

    if (updateData.type === 'fixed' && updateData.value !== undefined) {
      if (isNaN(updateData.value) || updateData.value < 0) {
        return res.status(400).json({
          success: false,
          message: 'Fixed value cannot be negative'
        });
      }
    }

    // Validate fixed coupon value against minimum amount during update
    if (updateData.type === 'fixed' && updateData.value !== undefined && updateData.minimumAmount !== undefined) {
      if (updateData.value > updateData.minimumAmount) {
        return res.status(400).json({
          success: false,
          message: 'Fixed coupon value cannot be greater than minimum amount'
        });
      }
    }

    // Validate flash sale dates during update
    if (updateData.flashSaleStart || updateData.flashSaleEnd) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of today
      
      if (updateData.flashSaleStart) {
        const startDate = new Date(updateData.flashSaleStart);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid flash sale start date format'
          });
        }
        if (startDate < today) {
          return res.status(400).json({
            success: false,
            message: 'Flash sale start date cannot be in the past'
          });
        }
      }
      
      if (updateData.flashSaleStart && updateData.flashSaleEnd) {
        const startDate = new Date(updateData.flashSaleStart);
        const endDate = new Date(updateData.flashSaleEnd);
        if (isNaN(endDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid flash sale end date format'
          });
        }
        if (endDate < startDate) {
          return res.status(400).json({
            success: false,
            message: 'Flash sale end date cannot be before start date'
          });
        }
      }
    }

    // Convert date strings to proper Date objects for flash sale
    if (updateData.flashSaleStart) {
      updateData.flashSaleStart = new Date(updateData.flashSaleStart + 'T00:00:00.000Z');
    }
    if (updateData.flashSaleEnd) {
      updateData.flashSaleEnd = new Date(updateData.flashSaleEnd + 'T23:59:59.999Z');
    }

    // Handle image upload for update (multer uses req.files with fields)
    // Match the banner controller pattern for consistency
    console.log('🔍 Image update check:', {
      hasImageUrls: !!req.imageUrls,
      imageUrl: req.imageUrls?.image,
      hasFiles: !!req.files,
      imageFile: req.files?.['image']?.[0]?.path,
      rawDataImage: rawData.image
    });
    
    if (req.imageUrls && req.imageUrls.image) {
      updateData.image = req.imageUrls.image;
      console.log('✅ Image updated from req.imageUrls:', req.imageUrls.image);
    } else if (req.files && req.files['image'] && req.files['image'][0]) {
      updateData.image = req.files['image'][0].path;
      console.log('✅ Image updated from req.files:', req.files['image'][0].path);
    }
    // If no new image is uploaded, don't update the image field (it will keep the existing one)
    
    console.log('📦 Final updateData before save:', {
      ...updateData,
      image: updateData.image ? '✅ Image included' : '❌ No image field'
    });

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('applicableCategories', 'name')
     .populate('applicableProducts', 'productName');
     
    console.log('💾 Saved coupon image:', coupon?.image);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: coupon
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon',
      error: error.message
    });
  }
};

// Delete coupon
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findByIdAndDelete(id);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon',
      error: error.message
    });
  }
};

// Validate coupon code
export const validateCoupon = async (req, res) => {
  try {
    const { code, orderAmount, userId } = req.body;

    if (!code || !orderAmount) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code and order amount are required'
      });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    // Check if coupon is valid
    if (!coupon.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Coupon is not valid or has expired'
      });
    }

    // Check minimum amount requirement
    if (orderAmount < coupon.minimumAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of ₹${coupon.minimumAmount} required to apply this coupon`
      });
    }

    // Calculate discount
    const discountAmount = coupon.calculateDiscount(orderAmount);

    res.json({
      success: true,
      data: {
        coupon,
        discountAmount,
        finalAmount: orderAmount - discountAmount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon',
      error: error.message
    });
  }
}; 