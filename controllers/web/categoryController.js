import Category from '../../models/category.js';

export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    
    // Get product count for each category using aggregation
    const categoriesWithProductCount = await Category.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'category',
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
    
    res.json({ success: true, data: categoriesWithProductCount });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch categories', error: err.message });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    let image = req.body.image;
    if (req.imageUrls && req.imageUrls.image) {
      image = req.imageUrls.image;
    }
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const category = await Category.create({ name, image, description, status: 'Active' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create category', error: err.message });
  }
};

export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch category', error: err.message });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    let updateData = { name, description, status };
    if (req.imageUrls && req.imageUrls.image) {
      updateData.image = req.imageUrls.image;
    }
    const category = await Category.findByIdAndUpdate(id, updateData, { new: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update category', error: err.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete category', error: err.message });
  }
}; 