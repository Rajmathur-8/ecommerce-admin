import Subcategory from '../../models/subcategory.js';
import Product from '../../models/product.js';

export const createSubcategory = async (req, res) => {
  try {
    const { name, description, category, isActive } = req.body;
    let image = req.body.image;
    if (req.imageUrls && req.imageUrls.image) {
      image = req.imageUrls.image;
    }
    if (!name || !category) return res.status(400).json({ success: false, message: 'Name and category are required' });
    const subcategory = await Subcategory.create({ name, description, category, image, isActive });
    res.json({ success: true, data: subcategory });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create subcategory', error: err.message });
  }
};

export const getSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find().populate('category');
    
    // Get product count for each subcategory using aggregation
    const subcategoriesWithProductCount = await Subcategory.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'subcategory',
          as: 'products'
        }
      },
      {
        $addFields: {
          productCount: { $size: '$products' }
        }
      },
      {
        $project: {
          products: 0 // Remove the products array from the result
        }
      }
    ]);
    
    // Populate category information
    const populatedSubcategories = await Subcategory.populate(subcategoriesWithProductCount, {
      path: 'category',
      select: 'name'
    });
    
    res.json({ success: true, data: populatedSubcategories });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch subcategories', error: err.message });
  }
};

export const getSubcategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const subcategory = await Subcategory.findById(id).populate('category');
    if (!subcategory) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.json({ success: true, data: subcategory });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch subcategory', error: err.message });
  }
};

export const updateSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, isActive } = req.body;
    let updateData = { name, description, category, isActive };
    if (req.imageUrls && req.imageUrls.image) {
      updateData.image = req.imageUrls.image;
    }
    const subcategory = await Subcategory.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    if (!subcategory) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.json({ success: true, data: subcategory });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update subcategory', error: err.message });
  }
};

export const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;
    const subcategory = await Subcategory.findByIdAndDelete(id);
    if (!subcategory) return res.status(404).json({ success: false, message: 'Subcategory not found' });
    res.json({ success: true, message: 'Subcategory deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete subcategory', error: err.message });
  }
};
