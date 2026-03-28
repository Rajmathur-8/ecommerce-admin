import Cart from '../../models/cart.js';
import Product from '../../models/product.js';

// Get user's cart
export const getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOne({ user: userId })
      .populate('items.product')
      .populate('items.warranty')
      .populate('savedForLater.product')
      .populate('savedForLater.warranty');

    if (!cart) {
      // If no cart, create one
      const newCart = new Cart({ user: userId });
      await newCart.save();
      return res.status(200).json({ success: true, message: 'Cart is empty', data: { cart: newCart } });
    }

    // Ensure savedForLater exists
    if (!cart.savedForLater) {
      cart.savedForLater = [];
      await cart.save();
    }

    res.status(200).json({ success: true, message: 'Cart retrieved successfully', data: { cart } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve cart', error: error.message });
  }
};

// Add item to cart
export const addToCart = async (req, res) => {
  try {
    const { productId, quantity, variant, warranty } = req.body;
    const userId = req.user.id; // Assuming user is authenticated and user id is available in req.user

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    // Use discount price if available, otherwise use regular price
    // For variant: use variant.discountPrice if available, otherwise variant.price
    // For product: use product.discountPrice if available, otherwise product.price
    // Round to nearest integer (.50 and above rounds up, below rounds down)
    const rawPrice = variant 
      ? (variant.discountPrice || variant.price)
      : (product.discountPrice || product.price);
    const price = Math.round(rawPrice);
    const existingItemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId && 
      JSON.stringify(item.variant) === JSON.stringify(variant) &&
      (!warranty || (item.warranty && item.warranty.toString() === warranty))
    );

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({ product: productId, quantity, variant, price, warranty: warranty || null });
    }

    // Recalculate cart totals (including warranty prices)
    cart.itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
    cart.subtotal = cart.items.reduce((total, item) => {
      let itemTotal = item.price * item.quantity;
      // Add warranty price if exists
      if (item.warranty) {
        // Warranty price will be added when we populate warranty
      }
      return total + itemTotal;
    }, 0);
    // Apply coupon if exists and recalculate discount
    // For now, total is same as subtotal
    cart.total = cart.subtotal;

    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');

    res.status(200).json({ success: true, message: 'Product added to cart successfully', data: { cart } });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add product to cart', error: error.message });
  }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);

    if (itemIndex > -1) {
      cart.items.splice(itemIndex, 1);
    } else {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    // Recalculate cart totals
    cart.itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
    cart.subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
    cart.total = cart.subtotal; // Adjust for discounts if necessary

    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');

    res.status(200).json({ success: true, message: 'Product removed from cart successfully', data: { cart } });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove product from cart', error: error.message });
  }
};

// Update cart item quantity and warranty
export const updateCartItem = async (req, res) => {
  try {
    const { productId } = req.params; // Changed from itemId to productId
    const { quantity, warranty } = req.body;
    const userId = req.user.id;

    if (quantity && quantity <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Find item by product ID in the cart
    const itemIndex = cart.items.findIndex(item => 
      item.product.toString() === productId
    );

    if (itemIndex > -1) {
      if (quantity !== undefined) {
        cart.items[itemIndex].quantity = quantity;
      }
      if (warranty !== undefined) {
        cart.items[itemIndex].warranty = warranty || null;
      }
    } else {
      return res.status(404).json({ success: false, message: 'Product not found in cart' });
    }

    // Recalculate cart totals (including warranty prices)
    cart.itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
    cart.subtotal = cart.items.reduce((total, item) => {
      let itemTotal = item.price * item.quantity;
      // Warranty price will be added when we populate warranty
      return total + itemTotal;
    }, 0);
    cart.total = cart.subtotal; // Adjust for discounts if necessary

    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');

    res.status(200).json({ success: true, message: 'Cart updated successfully', data: { cart } });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update cart', error: error.message });
  }
};

// Save item for later
export const saveForLater = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);

    if (itemIndex > -1) {
      const [itemToSave] = cart.items.splice(itemIndex, 1);
      cart.savedForLater.push(itemToSave);

      // Recalculate cart totals
      cart.itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
      cart.subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
      cart.total = cart.subtotal; // Adjust for discounts if necessary

      cart.lastUpdated = Date.now();

      await cart.save();
      await cart.populate('items.product');
      await cart.populate('items.warranty');
      await cart.populate('savedForLater.product');

      res.status(200).json({ success: true, message: 'Item saved for later', data: { cart } });
    } else {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save item for later', error: error.message });
  }
};

// Move item to cart
export const moveToCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.savedForLater.findIndex(item => item._id.toString() === itemId);

    if (itemIndex > -1) {
      const [itemToMove] = cart.savedForLater.splice(itemIndex, 1);
      cart.items.push(itemToMove);

      // Recalculate cart totals
      cart.itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
      cart.subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
      cart.total = cart.subtotal; // Adjust for discounts if necessary

      cart.lastUpdated = Date.now();

      await cart.save();
      await cart.populate('items.product');
      await cart.populate('items.warranty');
      await cart.populate('savedForLater.product');

      res.status(200).json({ success: true, message: 'Item moved to cart', data: { cart } });
    } else {
      return res.status(404).json({ success: false, message: 'Item not found in saved for later list' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to move item to cart', error: error.message });
  }
};

// Remove item from saved for later
export const removeFromSaved = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const itemIndex = cart.savedForLater.findIndex(item => item._id.toString() === itemId);

    if (itemIndex > -1) {
      cart.savedForLater.splice(itemIndex, 1);
      cart.lastUpdated = Date.now();

      await cart.save();
      await cart.populate('items.product');
      await cart.populate('items.warranty');
      await cart.populate('savedForLater.product');

      res.status(200).json({ success: true, message: 'Item removed from saved for later', data: { cart } });
    } else {
      return res.status(404).json({ success: false, message: 'Item not found in saved for later list' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove item from saved for later', error: error.message });
  }
};

// Clear cart
export const clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });

    if (cart) {
      cart.items = [];
      cart.itemCount = 0;
      cart.subtotal = 0;
      cart.discountAmount = 0;
      cart.total = 0;
      cart.coupon = undefined;
      cart.promoCode = undefined;
      cart.giftVoucher = undefined;
      cart.lastUpdated = Date.now();
      await cart.save();
      await cart.populate('items.product');
      await cart.populate('items.warranty');
      res.status(200).json({ success: true, message: 'Cart cleared successfully', data: { cart } });
    } else {
      res.status(404).json({ success: false, message: 'Cart not found' });
    }

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to clear cart', error: error.message });
  }
};

// Get guest cart
export const getGuestCart = async (req, res) => {
  try {
    const { guestId } = req.params;
    
    if (!guestId) {
      return res.status(400).json({ success: false, message: 'Guest ID is required' });
    }

    const cart = await Cart.findOne({ guestId }).populate('items.product').populate('savedForLater.product');

    if (!cart) {
      // If no cart, create one
      const newCart = new Cart({ guestId });
      await newCart.save();
      return res.status(200).json({ success: true, message: 'Cart is empty', data: { cart: newCart } });
    }

    // Ensure savedForLater exists
    if (!cart.savedForLater) {
      cart.savedForLater = [];
      await cart.save();
    }

    res.status(200).json({ success: true, message: 'Cart retrieved successfully', data: { cart } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve guest cart', error: error.message });
  }
};

// Add item to guest cart
export const addToGuestCart = async (req, res) => {
  try {
    const { guestId, productId, quantity, variant } = req.body;

    if (!guestId) {
      return res.status(400).json({ success: false, message: 'Guest ID is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let cart = await Cart.findOne({ guestId });

    if (!cart) {
      cart = new Cart({ guestId, items: [] });
    }

    // Use discount price if available, otherwise use regular price
    // For variant: use variant.discountPrice if available, otherwise variant.price
    // For product: use product.discountPrice if available, otherwise product.price
    // Round to nearest integer (.50 and above rounds up, below rounds down)
    const rawPrice = variant 
      ? (variant.discountPrice || variant.price)
      : (product.discountPrice || product.price);
    const price = Math.round(rawPrice);
    const existingItemIndex = cart.items.findIndex(item => item.product.toString() === productId && JSON.stringify(item.variant) === JSON.stringify(variant));

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({ product: productId, quantity, variant, price });
    }

    // Recalculate cart totals
    cart.itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
    cart.subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
    cart.total = cart.subtotal;

    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');

    res.status(200).json({ success: true, message: 'Product added to guest cart successfully', data: { cart } });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add product to guest cart', error: error.message });
  }
};

// Merge guest cart with user cart
export const mergeCart = async (req, res) => {
  try {
    const { guestId } = req.body;
    const userId = req.user.id;

    if (!guestId) {
      return res.status(400).json({ success: false, message: 'Guest ID is required' });
    }

    // Find user cart
    let userCart = await Cart.findOne({ user: userId });
    if (!userCart) {
      userCart = new Cart({ user: userId, items: [] });
    }

    // Find guest cart
    const guestCart = await Cart.findOne({ guestId });
    if (!guestCart) {
      return res.status(200).json({ success: true, message: 'No guest cart to merge', data: { cart: userCart } });
    }

    // Merge items from guest cart to user cart
    for (const guestItem of guestCart.items) {
      const existingItemIndex = userCart.items.findIndex(item => 
        item.product.toString() === guestItem.product.toString() && 
        JSON.stringify(item.variant) === JSON.stringify(guestItem.variant)
      );

      if (existingItemIndex > -1) {
        // If item exists, add quantities
        userCart.items[existingItemIndex].quantity += guestItem.quantity;
      } else {
        // If item doesn't exist, add it
        userCart.items.push({
          product: guestItem.product,
          quantity: guestItem.quantity,
          variant: guestItem.variant,
          price: guestItem.price
        });
      }
    }

    // Merge saved for later items
    if (guestCart.savedForLater && guestCart.savedForLater.length > 0) {
      if (!userCart.savedForLater) {
        userCart.savedForLater = [];
      }
      
      for (const savedItem of guestCart.savedForLater) {
        const existingSavedIndex = userCart.savedForLater.findIndex(item => 
          item.product.toString() === savedItem.product.toString() && 
          JSON.stringify(item.variant) === JSON.stringify(savedItem.variant)
        );

        if (existingSavedIndex === -1) {
          userCart.savedForLater.push({
            product: savedItem.product,
            quantity: savedItem.quantity,
            variant: savedItem.variant,
            price: savedItem.price
          });
        }
      }
    }

    // Recalculate cart totals
    userCart.itemCount = userCart.items.reduce((count, item) => count + item.quantity, 0);
    userCart.subtotal = userCart.items.reduce((total, item) => total + item.price * item.quantity, 0);
    userCart.total = userCart.subtotal; // Adjust for discounts if necessary
    userCart.lastUpdated = Date.now();

    // Save user cart
    await userCart.save();
    await userCart.populate('items.product');
    await userCart.populate('savedForLater.product');

    // Delete guest cart
    await Cart.findByIdAndDelete(guestCart._id);

    res.status(200).json({ 
      success: true, 
      message: 'Cart merged successfully', 
      data: { cart: userCart } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to merge cart', 
      error: error.message 
    });
  }
};

// Apply coupon to cart
export const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Import Coupon model
    const Coupon = (await import('../../models/coupon.js')).default;
    
    // Find the coupon
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    }

    // Convert mongoose document to plain object to ensure all fields are accessible
    const couponData = coupon.toObject ? coupon.toObject() : coupon;
    
    console.log('=== COUPON DATA DEBUG ===');
    console.log('Coupon value:', couponData.value);
    console.log('Coupon type:', couponData.type);
    console.log('Coupon minimumAmount:', couponData.minimumAmount);
    console.log('Coupon code:', couponData.code);

    // Validate coupon has required fields
    if (couponData.value === undefined || couponData.value === null || isNaN(couponData.value)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon configuration error: Invalid discount value' 
      });
    }

    if (!couponData.type || !['percentage', 'fixed'].includes(couponData.type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon configuration error: Invalid coupon type' 
      });
    }

    // Check if coupon is already applied
    if (cart.coupon && typeof cart.coupon === 'object' && cart.coupon.code === code.toUpperCase()) {
      return res.status(400).json({ success: false, message: 'Coupon is already applied' });
    }

    // Check if coupon is valid using the model method with detailed error messages
    const now = new Date();
    let couponValidationError = null;
    
    if (!couponData.isActive) {
      couponValidationError = 'Coupon is not active';
    } else if (couponData.validUntil && now > new Date(couponData.validUntil)) {
      couponValidationError = 'Coupon has expired';
    } else if (couponData.validFrom && now < new Date(couponData.validFrom)) {
      couponValidationError = 'Coupon is not yet valid';
    } else if (couponData.usageLimit && couponData.usedCount >= couponData.usageLimit) {
      couponValidationError = 'Coupon usage limit has been reached';
    } else if (couponData.isFlashSale) {
      if (couponData.flashSaleStart && now < new Date(couponData.flashSaleStart)) {
        couponValidationError = 'Flash sale has not started yet';
      } else if (couponData.flashSaleEnd && now > new Date(couponData.flashSaleEnd)) {
        couponValidationError = 'Flash sale has ended';
      }
    }
    
    if (couponValidationError) {
      console.log('Coupon validation failed:', {
        code: couponData.code,
        isActive: couponData.isActive,
        validFrom: couponData.validFrom,
        validUntil: couponData.validUntil,
        isFlashSale: couponData.isFlashSale,
        flashSaleStart: couponData.flashSaleStart,
        flashSaleEnd: couponData.flashSaleEnd,
        usageLimit: couponData.usageLimit,
        usedCount: couponData.usedCount,
        currentTime: now,
        error: couponValidationError
      });
      return res.status(400).json({ success: false, message: couponValidationError });
    }
    
    // Double check with isValid method
    if (!coupon.isValid()) {
      console.log('Coupon isValid() method returned false:', {
        code: couponData.code,
        isActive: couponData.isActive,
        validFrom: couponData.validFrom,
        validUntil: couponData.validUntil,
        isFlashSale: couponData.isFlashSale,
        flashSaleStart: couponData.flashSaleStart,
        flashSaleEnd: couponData.flashSaleEnd
      });
      return res.status(400).json({ success: false, message: 'Coupon is not valid or has expired' });
    }

    // Check minimum order value (use minimumAmount from coupon model)
    if (cart.subtotal < couponData.minimumAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order value of ₹${couponData.minimumAmount} required for this coupon` 
      });
    }

    // Ensure cart subtotal is a valid number
    if (!cart.subtotal || isNaN(cart.subtotal) || cart.subtotal <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cart subtotal. Please add items to cart first.' 
      });
    }

    // Calculate discount amount using the coupon's calculateDiscount method
    // This method handles both 'percentage' and 'fixed' types correctly
    const calculatedDiscount = coupon.calculateDiscount(cart.subtotal);
    
    console.log('=== COUPON APPLICATION DEBUG ===');
    console.log('Coupon type:', couponData.type);
    console.log('Coupon value:', couponData.value);
    console.log('Cart subtotal:', cart.subtotal);
    console.log('Calculated discount:', calculatedDiscount);
    console.log('Calculated discount type:', typeof calculatedDiscount);
    
    // Ensure discountAmount is a valid number
    if (isNaN(calculatedDiscount) || calculatedDiscount < 0 || !isFinite(calculatedDiscount)) {
      console.log({
        type: couponData.type,
        value: couponData.value,
        subtotal: cart.subtotal,
        calculatedDiscount,
        calculatedDiscountType: typeof calculatedDiscount
      });
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid discount calculation. Please try again.' 
      });
    }

    // Apply coupon - ensure all fields are properly set with correct types
    // Note: Using couponType instead of type to avoid conflict with mongoose schema type keyword
    cart.coupon = {
      code: String(couponData.code || code.toUpperCase()),
      discount: Number(couponData.value), // Convert to number explicitly - this is the key fix
      couponType: String(couponData.type || 'percentage')
    };

    // Mark coupon as modified since it's a nested object
    cart.markModified('coupon');

    // Set discount amount (already calculated based on type) - ensure it's a valid number
    cart.discountAmount = Number(calculatedDiscount);
    
    // Final validation - ensure all values are valid before saving
    if (isNaN(cart.discountAmount) || !isFinite(cart.discountAmount)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid discount amount. Please try again.' 
      });
    }
    
    console.log('Final coupon object:', cart.coupon);
    console.log('Final discount amount:', cart.discountAmount);
    console.log('Cart total before discount:', cart.subtotal);
    console.log('Cart total after discount:', cart.subtotal - cart.discountAmount);

    // Recalculate total - ensure it's never negative
    cart.total = Math.max(0, cart.subtotal - cart.discountAmount);
    cart.lastUpdated = Date.now();

    // Validate cart before saving
    const validationError = cart.validateSync();
    if (validationError) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cart validation failed', 
        error: validationError.message 
      });
    }

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');
    await cart.populate('savedForLater.product');

    res.status(200).json({ 
      success: true, 
      message: 'Coupon applied successfully', 
      data: { cart } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to apply coupon', 
      error: error.message 
    });
  }
};

// Remove coupon from cart
export const removeCoupon = async (req, res) => {
  try {
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Remove coupon and recalculate discount (promo code + gift voucher if they exist)
    cart.coupon = undefined;
    
    const promoDiscount = cart.promoCode && cart.promoCode.discount ? cart.promoCode.discount : 0;
    const voucherDiscount = cart.giftVoucher && cart.giftVoucher.discount ? cart.giftVoucher.discount : 0;
    cart.discountAmount = promoDiscount + voucherDiscount;
    cart.total = Math.max(0, cart.subtotal - cart.discountAmount);
    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');
    await cart.populate('savedForLater.product');

    res.status(200).json({ 
      success: true, 
      message: 'Coupon removed successfully', 
      data: { cart } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove coupon', 
      error: error.message 
    });
  }
};

// Apply promo code to cart
export const applyPromoCode = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Promo code is required' });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Import Promo model
    const Promo = (await import('../../models/promo.js')).default;
    
    // Find the promo code
    const promo = await Promo.findOne({ code: code.toUpperCase(), isActive: true });
    if (!promo) {
      return res.status(404).json({ success: false, message: 'Invalid or expired promo code' });
    }

    const promoData = promo.toObject ? promo.toObject() : promo;
    
    // Validate promo code
    if (promoData.value === undefined || promoData.value === null || isNaN(promoData.value)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Promo code configuration error: Invalid discount value' 
      });
    }

    if (!promoData.type || !['percentage', 'fixed'].includes(promoData.type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Promo code configuration error: Invalid promo type' 
      });
    }

    // Check if promo code is already applied
    if (cart.promoCode && typeof cart.promoCode === 'object' && cart.promoCode.code === code.toUpperCase()) {
      return res.status(400).json({ success: false, message: 'Promo code is already applied' });
    }

    // Validate promo code using model method
    const now = new Date();
    if (!promo.isValid()) {
      return res.status(400).json({ success: false, message: 'Promo code is not valid or has expired' });
    }

    // Check if promo code is one-time use per user
    if (promoData.isOneTimeUse) {
      const Order = (await import('../../models/order.js')).default;
      const existingOrder = await Order.findOne({ 
        user: userId,
        promoCode: promoData.code
      });
      if (existingOrder) {
        return res.status(400).json({ 
          success: false, 
          message: 'You have already used this promo code. Each promo code can only be used once per user.' 
        });
      }
    }

    // Check minimum order value
    if (cart.subtotal < promoData.minimumAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order value of ₹${promoData.minimumAmount} required for this promo code` 
      });
    }

    // Ensure cart subtotal is valid
    if (!cart.subtotal || isNaN(cart.subtotal) || cart.subtotal <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cart subtotal. Please add items to cart first.' 
      });
    }

    // Calculate discount amount
    const calculatedDiscount = promo.calculateDiscount(cart.subtotal);
    
    if (isNaN(calculatedDiscount) || calculatedDiscount < 0 || !isFinite(calculatedDiscount)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid discount calculation. Please try again.' 
      });
    }

    // Apply promo code with promoId
    cart.promoCode = {
      code: String(promoData.code || code.toUpperCase()),
      promoId: promo._id, // Save promo ID for analytics
      discount: Number(calculatedDiscount),
      promoType: String(promoData.type || 'percentage')
    };

    cart.markModified('promoCode');

    // Calculate total discount (coupon + promo code)
    const couponDiscount = cart.coupon && cart.coupon.discount ? cart.coupon.discount : 0;
    const totalDiscount = couponDiscount + Number(calculatedDiscount);
    
    cart.discountAmount = Math.min(totalDiscount, cart.subtotal);
    cart.total = Math.max(0, cart.subtotal - cart.discountAmount);
    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');
    await cart.populate('savedForLater.product');

    res.status(200).json({ 
      success: true, 
      message: 'Promo code applied successfully', 
      data: { cart } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to apply promo code', 
      error: error.message 
    });
  }
};

// Remove promo code from cart
export const removePromoCode = async (req, res) => {
  try {
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Remove promo code and recalculate discount
    cart.promoCode = undefined;
    
    // Recalculate discount (only coupon discount if coupon exists)
    const couponDiscount = cart.coupon && cart.coupon.discount ? cart.coupon.discount : 0;
    cart.discountAmount = couponDiscount;
    cart.total = Math.max(0, cart.subtotal - cart.discountAmount);
    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');
    await cart.populate('savedForLater.product');

    res.status(200).json({ 
      success: true, 
      message: 'Promo code removed successfully', 
      data: { cart } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove promo code', 
      error: error.message 
    });
  }
};

// Apply gift voucher to cart
export const applyGiftVoucher = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Gift voucher code is required' });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Import GiftVoucher model
    const GiftVoucher = (await import('../../models/giftVoucher.js')).default;
    
    // Find the gift voucher
    const giftVoucher = await GiftVoucher.findOne({ code: code.toUpperCase(), isActive: true });
    if (!giftVoucher) {
      return res.status(404).json({ success: false, message: 'Invalid or expired gift voucher' });
    }

    const voucherData = giftVoucher.toObject ? giftVoucher.toObject() : giftVoucher;
    
    // Validate gift voucher
    if (voucherData.value === undefined || voucherData.value === null || isNaN(voucherData.value)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Gift voucher configuration error: Invalid discount value' 
      });
    }

    if (!voucherData.type || !['percentage', 'fixed'].includes(voucherData.type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Gift voucher configuration error: Invalid voucher type' 
      });
    }

    // Check if gift voucher is already applied
    if (cart.giftVoucher && typeof cart.giftVoucher === 'object' && cart.giftVoucher.code === code.toUpperCase()) {
      return res.status(400).json({ success: false, message: 'Gift voucher is already applied' });
    }

    // Validate gift voucher using model method
    if (!giftVoucher.isValid()) {
      return res.status(400).json({ success: false, message: 'Gift voucher is not valid or has expired' });
    }

    // Check if gift voucher is one-time use per user
    if (voucherData.isOneTimeUse) {
      const Order = (await import('../../models/order.js')).default;
      const existingOrder = await Order.findOne({ 
        user: userId,
        giftVoucherCode: voucherData.code
      });
      if (existingOrder) {
        return res.status(400).json({ 
          success: false, 
          message: 'You have already used this gift voucher. Each gift voucher can only be used once per user.' 
        });
      }
    }

    // Check minimum order value
    if (cart.subtotal < voucherData.minimumAmount) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order value of ₹${voucherData.minimumAmount} required for this gift voucher` 
      });
    }

    // Ensure cart subtotal is valid
    if (!cart.subtotal || isNaN(cart.subtotal) || cart.subtotal <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cart subtotal. Please add items to cart first.' 
      });
    }

    // Calculate discount amount
    const calculatedDiscount = giftVoucher.calculateDiscount(cart.subtotal);
    
    if (isNaN(calculatedDiscount) || calculatedDiscount < 0 || !isFinite(calculatedDiscount)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid discount calculation. Please try again.' 
      });
    }

    // Apply gift voucher with giftVoucherId
    cart.giftVoucher = {
      code: String(voucherData.code || code.toUpperCase()),
      giftVoucherId: giftVoucher._id, // Save gift voucher ID for analytics
      discount: Number(calculatedDiscount),
      voucherType: String(voucherData.type || 'percentage')
    };

    cart.markModified('giftVoucher');

    // Calculate total discount (coupon + promo code + gift voucher)
    const couponDiscount = cart.coupon && cart.coupon.discount ? cart.coupon.discount : 0;
    const promoDiscount = cart.promoCode && cart.promoCode.discount ? cart.promoCode.discount : 0;
    const totalDiscount = couponDiscount + promoDiscount + Number(calculatedDiscount);
    
    cart.discountAmount = Math.min(totalDiscount, cart.subtotal);
    cart.total = Math.max(0, cart.subtotal - cart.discountAmount);
    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');
    await cart.populate('savedForLater.product');

    res.status(200).json({ 
      success: true, 
      message: 'Gift voucher applied successfully', 
      data: { cart } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to apply gift voucher', 
      error: error.message 
    });
  }
};

// Remove gift voucher from cart
export const removeGiftVoucher = async (req, res) => {
  try {
    const userId = req.user.id;

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Remove gift voucher and recalculate discount
    cart.giftVoucher = undefined;
    
    // Recalculate discount (coupon + promo code if they exist)
    const couponDiscount = cart.coupon && cart.coupon.discount ? cart.coupon.discount : 0;
    const promoDiscount = cart.promoCode && cart.promoCode.discount ? cart.promoCode.discount : 0;
    cart.discountAmount = couponDiscount + promoDiscount;
    cart.total = Math.max(0, cart.subtotal - cart.discountAmount);
    cart.lastUpdated = Date.now();

    await cart.save();
    await cart.populate('items.product');
    await cart.populate('items.warranty');
    await cart.populate('savedForLater.product');

    res.status(200).json({ 
      success: true, 
      message: 'Gift voucher removed successfully', 
      data: { cart } 
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove gift voucher', 
      error: error.message 
    });
  }
};
