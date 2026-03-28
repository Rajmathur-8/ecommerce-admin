import Banner from '../../models/banner.js';

// Get all active banners
export const getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: banners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch banners', error: err.message });
  }
};

// Create a new banner
export const createBanner = async (req, res) => {
  try {
    const { title, description, width, height, link, isPreOrder, preOrderProductId } = req.body;
    
    // Get image URL from uploaded file
    let image = '';
    if (req.imageUrls && req.imageUrls.image) {
      image = req.imageUrls.image;
    } else if (req.body.image) {
      // Fallback for base64 or URL
      image = req.body.image;
    }
    
    if (!image) {
      return res.status(400).json({ success: false, message: 'Image is required' });
    }
    
    // Create banner with isActive defaulting to true
    const banner = await Banner.create({ 
      title, 
      description, 
      image,
      width: width ? parseInt(width) : 1920,
      height: height ? parseInt(height) : 600,
      isActive: true, // Always set to true by default
      link: link || '',
      isPreOrder: isPreOrder === 'true' || isPreOrder === true,
      preOrderProductId: preOrderProductId || null
    });
    
    res.json({ success: true, data: banner });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create banner', error: err.message });
  }
};

// Get banner by ID
export const getBannerById = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    res.json({ success: true, data: banner });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch banner', error: err.message });
  }
};

// Delete banner by ID
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    res.json({ success: true, message: 'Banner deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete banner', error: err.message });
  }
};

// Update banner by ID
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, width, height, link, isPreOrder, preOrderProductId } = req.body;
    
    let updateData = { title, description };
    
    // Handle width and height
    if (width !== undefined) {
      updateData.width = parseInt(width);
    }
    if (height !== undefined) {
      updateData.height = parseInt(height);
    }
    
    // Handle link
    if (link !== undefined) {
      updateData.link = link || '';
    }
    
    // Handle pre-order fields
    if (isPreOrder !== undefined) {
      updateData.isPreOrder = isPreOrder === 'true' || isPreOrder === true;
    }
    if (preOrderProductId !== undefined) {
      updateData.preOrderProductId = preOrderProductId || null;
    }
    
    // Handle image update
    if (req.imageUrls && req.imageUrls.image) {
      updateData.image = req.imageUrls.image;
    } else if (req.body.image) {
      updateData.image = req.body.image;
    }
    
    const banner = await Banner.findByIdAndUpdate(id, updateData, { new: true });
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    res.json({ success: true, data: banner });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update banner', error: err.message });
  }
}; 