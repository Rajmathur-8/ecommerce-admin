import Product from '../../models/product.js';
import User from '../../models/user.js';

// Add a review to a product
export const addReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user?.id; // Assuming user is authenticated

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Review title is required' });
    }

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Review comment is required' });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Check if user has already reviewed this product
    const existingReview = product.reviews.find(review => 
      review.user.toString() === userId && review.isActive
    );

    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Handle review images if any
    let reviewImages = [];
    if (req.imageUrls && Array.isArray(req.imageUrls)) {
      reviewImages = req.imageUrls;
    }

    // Create new review
    const newReview = {
      user: userId,
      rating: parseInt(rating),
      title: title.trim(),
      comment: comment.trim(),
      images: reviewImages,
      isVerified: false,
      helpful: [],
      helpfulCount: 0,
      isActive: true
    };

    // Add review to product
    product.reviews.push(newReview);
    await product.save();

    // Populate user info for response
    const populatedProduct = await Product.findById(productId)
      .populate('reviews.user', 'displayName email')
      .populate('category', 'name')
      .populate('subcategory', 'name');

    const addedReview = populatedProduct.reviews[populatedProduct.reviews.length - 1];

    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      data: {
        review: addedReview,
        productStats: {
          averageRating: product.averageRating,
          totalReviews: product.totalReviews,
          ratingDistribution: product.ratingDistribution
        }
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add review', error: err.message });
  }
};

// Get reviews for a product
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, rating, sort = 'newest' } = req.query;

    const product = await Product.findById(productId)
      .populate('reviews.user', 'displayName email')
      .populate('category', 'name')
      .populate('subcategory', 'name');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Filter active reviews
    let reviews = product.reviews.filter(review => review.isActive);

    // Filter by rating if provided
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        reviews = reviews.filter(review => review.rating === ratingNum);
      }
    }

    // Sort reviews
    switch (sort) {
      case 'newest':
        reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'oldest':
        reviews.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'highest':
        reviews.sort((a, b) => b.rating - a.rating);
        break;
      case 'lowest':
        reviews.sort((a, b) => a.rating - b.rating);
        break;
      case 'helpful':
        reviews.sort((a, b) => b.helpfulCount - a.helpfulCount);
        break;
      default:
        reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    const totalPages = Math.ceil(reviews.length / limit);

    res.json({
      success: true,
      data: {
        reviews: paginatedReviews,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalReviews: reviews.length,
          hasNextPage: endIndex < reviews.length,
          hasPrevPage: page > 1
        },
        productStats: {
          averageRating: product.averageRating,
          totalReviews: product.totalReviews,
          ratingDistribution: product.ratingDistribution
        }
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch reviews', error: err.message });
  }
};

// Update a review
export const updateReview = async (req, res) => {
  try {
    const { productId, reviewId } = req.params;
    const { rating, title, comment } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Find the review
    const reviewIndex = product.reviews.findIndex(review => 
      review._id.toString() === reviewId && review.user.toString() === userId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({ success: false, message: 'Review not found or unauthorized' });
    }

    const review = product.reviews[reviewIndex];

    // Update review fields
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
      }
      review.rating = parseInt(rating);
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ success: false, message: 'Review title is required' });
      }
      review.title = title.trim();
    }

    if (comment !== undefined) {
      if (!comment.trim()) {
        return res.status(400).json({ success: false, message: 'Review comment is required' });
      }
      review.comment = comment.trim();
    }

    // Handle new images if any
    if (req.imageUrls && Array.isArray(req.imageUrls)) {
      review.images = req.imageUrls;
    }

    await product.save();

    // Populate user info for response
    const populatedProduct = await Product.findById(productId)
      .populate('reviews.user', 'displayName email')
      .populate('category', 'name')
      .populate('subcategory', 'name');

    const updatedReview = populatedProduct.reviews[reviewIndex];

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: {
        review: updatedReview,
        productStats: {
          averageRating: product.averageRating,
          totalReviews: product.totalReviews,
          ratingDistribution: product.ratingDistribution
        }
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update review', error: err.message });
  }
};

// Delete a review (soft delete)
export const deleteReview = async (req, res) => {
  try {
    const { productId, reviewId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Find the review
    const reviewIndex = product.reviews.findIndex(review => 
      review._id.toString() === reviewId && review.user.toString() === userId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({ success: false, message: 'Review not found or unauthorized' });
    }

    // Soft delete the review
    product.reviews[reviewIndex].isActive = false;
    await product.save();

    res.json({
      success: true,
      message: 'Review deleted successfully',
      data: {
        productStats: {
          averageRating: product.averageRating,
          totalReviews: product.totalReviews,
          ratingDistribution: product.ratingDistribution
        }
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete review', error: err.message });
  }
};

// Mark review as helpful
export const markReviewHelpful = async (req, res) => {
  try {
    const { productId, reviewId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Find the review
    const reviewIndex = product.reviews.findIndex(review => 
      review._id.toString() === reviewId && review.isActive
    );

    if (reviewIndex === -1) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    const review = product.reviews[reviewIndex];

    // Check if user has already marked this review as helpful
    const helpfulIndex = review.helpful.findIndex(id => id.toString() === userId);

    if (helpfulIndex !== -1) {
      // Remove from helpful
      review.helpful.splice(helpfulIndex, 1);
      review.helpfulCount = Math.max(0, review.helpfulCount - 1);
    } else {
      // Add to helpful
      review.helpful.push(userId);
      review.helpfulCount = review.helpful.length;
    }

    await product.save();

    res.json({
      success: true,
      message: helpfulIndex !== -1 ? 'Removed from helpful' : 'Marked as helpful',
      data: {
        helpfulCount: review.helpfulCount,
        isHelpful: helpfulIndex === -1
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to mark review helpful', error: err.message });
  }
};

// Get user's review for a product
export const getUserReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const product = await Product.findById(productId)
      .populate('reviews.user', 'displayName email');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Find user's review
    const userReview = product.reviews.find(review => 
      review.user._id.toString() === userId && review.isActive
    );

    res.json({
      success: true,
      data: {
        review: userReview || null,
        hasReviewed: !!userReview
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch user review', error: err.message });
  }
}; 