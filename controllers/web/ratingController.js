import Rating from '../../models/rating.js';
import Order from '../../models/order.js';
import Product from '../../models/product.js';

// Create a new rating/review
export const createRating = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { ratings, title, comment, images, videos } = req.body;
    const userId = req.user.id;

    console.log("🔍 Raw req.body:", req.body);
    console.log("🔍 Raw ratings:", ratings);
    console.log("🔍 Type of ratings:", typeof ratings);
    
    // Parse ratings if it's a string (from FormData)
    let parsedRatings = ratings;
    if (typeof ratings === 'string') {
      try {
        parsedRatings = JSON.parse(ratings);
        console.log("🔍 Parsed ratings:", parsedRatings);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ratings format'
        });
      }
    }
    
    console.log("🔍 Final ratings:", parsedRatings);

    // Check if order exists and belongs to user
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is delivered
    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'You can only review delivered orders'
      });
    }

    // Check if user has already reviewed this order
    const existingRating = await Rating.findOne({ user: userId, order: orderId });
    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this order'
      });
    }

    // Validate overall rating (required)
    if (!parsedRatings.overall || parsedRatings.overall < 1 || parsedRatings.overall > 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an overall rating between 1 and 5 stars.'
      });
    }

    // Validate optional ratings if provided
    const optionalRatings = ['valueForMoney', 'quality', 'delivery', 'packaging', 'customerService'];
    for (const ratingType of optionalRatings) {
      if (parsedRatings[ratingType] && (parsedRatings[ratingType] < 1 || parsedRatings[ratingType] > 5)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${ratingType} rating. Must be between 1 and 5.`
        });
      }
    }

    // Get the first product from order for the rating
    const firstProduct = order.items[0]?.product;

    // Create rating with only provided ratings
    const ratingData = {
      user: userId,
      order: orderId,
      product: firstProduct,
      ratings: {
        overall: parsedRatings.overall
      },
      title: title || null,
      comment,
      images: req.imageUrls || images || [], // Use uploaded images from Cloudinary first
      videos: videos || []
    };

    // Add optional ratings if provided
    if (parsedRatings.valueForMoney) ratingData.ratings.valueForMoney = parsedRatings.valueForMoney;
    if (parsedRatings.quality) ratingData.ratings.quality = parsedRatings.quality;
    if (parsedRatings.delivery) ratingData.ratings.delivery = parsedRatings.delivery;
    if (parsedRatings.packaging) ratingData.ratings.packaging = parsedRatings.packaging;
    if (parsedRatings.customerService) ratingData.ratings.customerService = parsedRatings.customerService;

    const rating = new Rating(ratingData);
    await rating.save();

    // Sync this rating to product reviews
    await syncOrderReviewToProduct(rating);

    // Populate user and order details for response
    await rating.populate('user', 'name email');
    await rating.populate('order', 'orderStatus createdAt');

    res.status(201).json({
      success: true,
      message: 'Rating submitted successfully',
      data: {
        rating
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get order reviews for a specific product
export const getProductOrderReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get paginated reviews for this product
    const reviews = await Rating.find({ 
      product: productId, 
      isActive: true 
    })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

    // Get total count for pagination
    const totalReviews = await Rating.countDocuments({ 
      product: productId, 
      isActive: true 
    });

    // Calculate statistics from all reviews
    const allReviews = await Rating.find({ 
      product: productId, 
      isActive: true 
    });
    
    if (totalReviews === 0) {
      return res.json({
        success: true,
        message: 'No reviews found for this product',
        data: {
          reviews: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          },
          productStats: {
            averageRating: 0,
            totalReviews: 0,
            ratingDistribution: {
              fiveStar: 0,
              fourStar: 0,
              threeStar: 0,
              twoStar: 0,
              oneStar: 0
            }
          }
        }
      });
    }

    // Calculate average rating
    const totalRating = allReviews.reduce((sum, review) => sum + review.ratings.overall, 0);
    const averageRating = totalRating / totalReviews;

    // Calculate rating distribution
    const ratingDistribution = {
      fiveStar: 0,
      fourStar: 0,
      threeStar: 0,
      twoStar: 0,
      oneStar: 0
    };

    allReviews.forEach(review => {
      const rating = review.ratings.overall;
      switch (rating) {
        case 5:
          ratingDistribution.fiveStar++;
          break;
        case 4:
          ratingDistribution.fourStar++;
          break;
        case 3:
          ratingDistribution.threeStar++;
          break;
        case 2:
          ratingDistribution.twoStar++;
          break;
        case 1:
          ratingDistribution.oneStar++;
          break;
      }
    });

    res.json({
      success: true,
      message: 'Product reviews retrieved successfully',
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalReviews,
          pages: Math.ceil(totalReviews / limit)
        },
        productStats: {
          averageRating: Math.round(averageRating * 10) / 10,
          totalReviews,
          ratingDistribution
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get rating for a specific order
export const getOrderRating = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    console.log('🔍 getOrderRating - Request details:');
    console.log('- orderId:', orderId);
    console.log('- userId:', userId);

    // Check if order exists and belongs to user
    const order = await Order.findOne({ _id: orderId, user: userId });
    console.log('📦 Order found for rating:', order ? 'Yes' : 'No');
    if (order) {
      console.log('- Order ID:', order._id);
      console.log('- Order User ID:', order.user);
      console.log('- Request User ID:', userId);
    }
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get rating for this order
    const rating = await Rating.findOne({ user: userId, order: orderId })
      .populate('user', 'name email')
      .populate('order', 'orderStatus createdAt');

    res.json({
      success: true,
      message: 'Rating retrieved successfully',
      data: {
        rating,
        hasRated: !!rating
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get user's ratings
export const getUserRatings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query; // Increased default limit from 10 to 50

    const ratings = await Rating.find({ user: userId, isActive: true })
      .populate('order', 'orderStatus createdAt total')
      .populate('product', 'productName images')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Rating.countDocuments({ user: userId, isActive: true });

    res.json({
      success: true,
      message: 'Ratings retrieved successfully',
      data: {
        ratings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update rating
export const updateRating = async (req, res) => {
  try {
    const { ratingId } = req.params;
    const { ratings, title, comment, images, videos } = req.body;
    const userId = req.user.id;

    // Find rating and check ownership
    const rating = await Rating.findOne({ _id: ratingId, user: userId });
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }

    // Update fields if provided
    if (ratings) {
      // Validate overall rating if provided
      if (ratings.overall && (ratings.overall < 1 || ratings.overall > 5)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid overall rating. Must be between 1 and 5.'
        });
      }

      // Validate optional ratings if provided
      const optionalRatings = ['valueForMoney', 'quality', 'delivery', 'packaging', 'customerService'];
      for (const ratingType of optionalRatings) {
        if (ratings[ratingType] && (ratings[ratingType] < 1 || ratings[ratingType] > 5)) {
          return res.status(400).json({
            success: false,
            message: `Invalid ${ratingType} rating. Must be between 1 and 5.`
          });
        }
      }

      // Update ratings
      if (ratings.overall) rating.ratings.overall = ratings.overall;
      if (ratings.valueForMoney !== undefined) rating.ratings.valueForMoney = ratings.valueForMoney;
      if (ratings.quality !== undefined) rating.ratings.quality = ratings.quality;
      if (ratings.delivery !== undefined) rating.ratings.delivery = ratings.delivery;
      if (ratings.packaging !== undefined) rating.ratings.packaging = ratings.packaging;
      if (ratings.customerService !== undefined) rating.ratings.customerService = ratings.customerService;
    }

    if (title !== undefined) {
      rating.title = title;
    }

    if (comment !== undefined) {
      rating.comment = comment;
    }

    if (images !== undefined) {
      rating.images = images;
    }

    if (videos !== undefined) {
      rating.videos = videos;
    }

    await rating.save();

    // Sync updated rating to product reviews
    await syncOrderReviewToProduct(rating);

    // Populate for response
    await rating.populate('user', 'name email');
    await rating.populate('order', 'orderStatus createdAt');

    res.json({
      success: true,
      message: 'Rating updated successfully',
      data: {
        rating
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete rating
export const deleteRating = async (req, res) => {
  try {
    const { ratingId } = req.params;
    const userId = req.user.id;

    // Find rating and check ownership
    const rating = await Rating.findOne({ _id: ratingId, user: userId });
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }

    // Soft delete by setting isActive to false
    rating.isActive = false;
    await rating.save();

    // Also remove the synced review from product
    await removeOrderReviewFromProduct(rating);

    res.json({
      success: true,
      message: 'Rating deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Helper function to sync order review to product reviews
const syncOrderReviewToProduct = async (rating) => {
  try {
    console.log('🔄 Syncing order review to product reviews...');
    console.log('Rating ID:', rating._id);
    console.log('Product ID:', rating.product);
    console.log('User ID:', rating.user);
    console.log('Overall Rating:', rating.ratings.overall);

    // Find the product
    const product = await Product.findById(rating.product);
    if (!product) {
      console.log('❌ Product not found for rating sync');
      return;
    }

    // Check if user has already reviewed this product directly
    const existingProductReview = product.reviews.find(review => 
      review.user.toString() === rating.user.toString() && review.isActive
    );

    if (existingProductReview) {
      console.log('✅ User already has a direct product review, skipping sync');
      return;
    }

    // Create a new product review from the order rating
    const newProductReview = {
      user: rating.user,
      rating: rating.ratings.overall,
      title: rating.title || `Order Review - ${new Date().toLocaleDateString()}`,
      comment: rating.comment,
      images: rating.images || [],
      isVerified: true, // Mark as verified since it's from a delivered order
      helpful: [],
      helpfulCount: 0,
      isActive: true
    };

    // Add the review to the product
    product.reviews.push(newProductReview);
    await product.save();

    console.log('✅ Successfully synced order review to product reviews');
    console.log('Product average rating updated to:', product.averageRating);
    console.log('Product total reviews updated to:', product.totalReviews);

  } catch (error) {
  }
};

// Helper function to remove order review from product reviews
const removeOrderReviewFromProduct = async (rating) => {
  try {
    console.log('🗑️ Removing order review from product reviews...');
    console.log('Rating ID:', rating._id);
    console.log('Product ID:', rating.product);
    console.log('User ID:', rating.user);

    // Find the product
    const product = await Product.findById(rating.product);
    if (!product) {
      console.log('❌ Product not found for rating removal');
      return;
    }

    // Find and remove the synced review from product
    const reviewIndex = product.reviews.findIndex(review => 
      review.user.toString() === rating.user.toString() && 
      review.isActive &&
      review.isVerified // Only remove verified reviews (from orders)
    );

    if (reviewIndex !== -1) {
      // Soft delete the review
      product.reviews[reviewIndex].isActive = false;
      await product.save();
      console.log('✅ Successfully removed order review from product reviews');
    } else {
      console.log('ℹ️ No synced review found to remove');
    }

  } catch (error) {
  }
}; 