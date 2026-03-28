import Wishlist from '../../models/wishlist.js';
import Product from '../../models/product.js';
import mongoose from 'mongoose';

// Get user's wishlist
export const getWishlist = async (req, res) => {
  try {
    console.log('=== GET WISHLIST DEBUG ===');
    console.log('User object:', req.user);
    console.log('User ID:', req.user.id);
    
    const userId = req.user.id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found in token'
      });
    }
    
    let wishlist = await Wishlist.findOne({ user: userId })
      .populate({
        path: 'products.product',
        select: 'productName price discountPrice images category stock averageRating totalReviews'
      });

    if (!wishlist) {
      console.log('Creating new wishlist for user:', userId);
      wishlist = new Wishlist({ user: userId, products: [] });
      await wishlist.save();
    }

    console.log('Wishlist found/created:', wishlist);
    console.log('Wishlist products count:', wishlist.products.length);

    res.json({
      success: true,
      data: {
        wishlist: wishlist.products
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist',
      error: error.message
    });
  }
};

// Add product to wishlist
export const addToWishlist = async (req, res) => {
  try {
    console.log('=== ADD TO WISHLIST DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Request body type:', typeof req.body);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('User:', req.user);
    console.log('Headers:', req.headers);
    
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    const userId = req.user.id;
    const { productId } = req.body;

    console.log('User ID type:', typeof userId);
    console.log('User ID:', userId);
    console.log('Product ID type:', typeof productId);
    console.log('Product ID:', productId);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Check if product exists
    console.log('Looking for product with ID:', productId);
    
    // Validate productId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format'
      });
    }
    
    const product = await Product.findById(productId);
    console.log('Product found:', product ? 'Yes' : 'No');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log('Looking for wishlist for user:', userId);
    let wishlist = await Wishlist.findOne({ user: userId });
    console.log('Wishlist found:', wishlist ? 'Yes' : 'No');
    
    if (!wishlist) {
      console.log('Creating new wishlist for user');
      wishlist = new Wishlist({ user: userId, products: [] });
    }

    // Check if product is already in wishlist
    console.log('Checking if product already exists in wishlist');
    const existingProduct = wishlist.products.find(
      item => item.product.toString() === productId
    );
    console.log('Product already exists:', existingProduct ? 'Yes' : 'No');

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product is already in wishlist'
      });
    }

    // Add product to wishlist
    console.log('Adding product to wishlist');
    wishlist.products.push({ product: productId });
    await wishlist.save();
    console.log('Wishlist saved successfully');

    // Populate product details
    await wishlist.populate({
      path: 'products.product',
      select: 'productName price discountPrice images category stock averageRating totalReviews'
    });

    res.json({
      success: true,
      message: 'Product added to wishlist successfully',
      data: {
        wishlist: wishlist.products
      }
    });
  } catch (error) {
    
    res.status(500).json({
      success: false,
      message: 'Failed to add product to wishlist',
      error: error.message
    });
  }
};

// Remove product from wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Remove product from wishlist
    wishlist.products = wishlist.products.filter(
      item => item.product.toString() !== productId
    );

    await wishlist.save();

    // Populate product details
    await wishlist.populate({
      path: 'products.product',
      select: 'productName price discountPrice images category stock averageRating totalReviews'
    });

    res.json({
      success: true,
      message: 'Product removed from wishlist successfully',
      data: {
        wishlist: wishlist.products
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from wishlist'
    });
  }
};

// Check if product is in wishlist
export const checkWishlistStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const wishlist = await Wishlist.findOne({ user: userId });
    
    if (!wishlist) {
      return res.json({
        success: true,
        data: {
          isWishlisted: false
        }
      });
    }

    const isWishlisted = wishlist.products.some(
      item => item.product.toString() === productId
    );

    res.json({
      success: true,
      data: {
        isWishlisted
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check wishlist status'
    });
  }
};


