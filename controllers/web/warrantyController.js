import Warranty from '../../models/warranty.js';
import Product from '../../models/product.js';
import Order from '../../models/order.js';

// Get warranties for a specific product
export const getProductWarranties = async (req, res) => {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID is required' 
      });
    }

    // Get product to check category
    const product = await Product.findById(productId)
      .populate('category', 'name')
      .populate('subcategory', 'name');
    
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    // Find warranties that apply to this product
    // Warranty applies if:
    // 1. Product is in applicableProducts array, OR
    // 2. Product's category is in applicableCategories array, OR
    // 3. Warranty has no specific products/categories (applies to all)
    const warranties = await Warranty.find({
      isActive: true,
      $or: [
        { applicableProducts: productId },
        { applicableCategories: product.category?._id },
        { 
          $and: [
            { applicableProducts: { $size: 0 } },
            { applicableCategories: { $size: 0 } }
          ]
        }
      ]
    })
    .sort({ price: 1 }) // Sort by price ascending
    .select('name description duration price coverage termsAndConditions image');

    res.json({
      success: true,
      data: warranties
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch warranties', 
      error: error.message 
    });
  }
};

// Get warranties for multiple products (for cart)
export const getWarrantiesForProducts = async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product IDs array is required' 
      });
    }

    // Get products to check categories
    const products = await Product.find({ _id: { $in: productIds } })
      .populate('category', 'name')
      .select('_id category');

    const productCategoryMap = new Map();
    products.forEach(product => {
      if (product.category) {
        productCategoryMap.set(product._id.toString(), product.category._id.toString());
      }
    });

    // Find warranties for all products
    const warranties = await Warranty.find({
      isActive: true,
      $or: [
        { applicableProducts: { $in: productIds } },
        { applicableCategories: { $in: Array.from(productCategoryMap.values()) } },
        { 
          $and: [
            { applicableProducts: { $size: 0 } },
            { applicableCategories: { $size: 0 } }
          ]
        }
      ]
    })
    .sort({ price: 1 })
    .select('name description duration price coverage termsAndConditions image applicableProducts applicableCategories');

    // Group warranties by product
    const warrantiesByProduct = {};
    productIds.forEach(productId => {
      warrantiesByProduct[productId] = warranties.filter(warranty => {
        // Check if warranty applies to this product
        const productCategoryId = productCategoryMap.get(productId);
        return (
          warranty.applicableProducts.some(p => p.toString() === productId) ||
          (productCategoryId && warranty.applicableCategories.some(c => c.toString() === productCategoryId)) ||
          (warranty.applicableProducts.length === 0 && warranty.applicableCategories.length === 0)
        );
      });
    });

    res.json({
      success: true,
      data: warrantiesByProduct
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch warranties', 
      error: error.message 
    });
  }
};

// Get user's warranties (for profile page)
export const getUserWarranties = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get all orders with warranties for this user
    const orders = await Order.find({
      user: userId,
      'items.warranty': { $exists: true, $ne: null }
    })
      .populate('items.product', 'productName images')
      .populate('items.warranty', 'name description duration price coverage')
      .sort({ createdAt: -1 });

    const warranties = [];
    const now = new Date();

    for (const order of orders) {
      for (const item of order.items) {
        if (item.warranty && typeof item.warranty === 'object') {
          const orderDate = new Date(order.createdAt);
          const expiryDate = new Date(orderDate);
          expiryDate.setMonth(expiryDate.getMonth() + item.warranty.duration);

          const isExpired = expiryDate < now;
          const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

          warranties.push({
            warrantyId: item.warranty._id,
            warrantyName: item.warranty.name,
            warrantyDescription: item.warranty.description,
            duration: item.warranty.duration,
            price: item.warranty.price,
            coverage: item.warranty.coverage || [],
            productId: item.product._id,
            productName: typeof item.product === 'object' ? item.product.productName : 'N/A',
            productImage: typeof item.product === 'object' && item.product.images?.[0] ? item.product.images[0] : null,
            orderId: order._id,
            orderNumber: order.orderNumber,
            purchaseDate: order.createdAt,
            expiryDate,
            status: isExpired ? 'expired' : 'active',
            daysRemaining: isExpired ? 0 : daysRemaining
          });
        }
      }
    }

    res.json({
      success: true,
      data: warranties
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user warranties',
      error: error.message
    });
  }
};

