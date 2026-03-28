import PaymentMethod from '../../models/paymentMethod.js';
import notificationService from '../../services/notificationService.js';
import User from '../../models/user.js';
import { createTransactionForRazorpayOrder } from '../admin/transactionController.js';

// Get all active payment methods
export const getPaymentMethods = async (req, res) => {
  try {
    const { orderTotal = 0 } = req.query;
    
    // Get all active payment methods
    const paymentMethods = await PaymentMethod.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    // Filter payment methods based on order total and restrictions
    const filteredMethods = paymentMethods.filter(method => {
      // Check minimum order value
      if (method.restrictions?.minOrderValue && orderTotal < method.restrictions.minOrderValue) {
        return false;
      }
      
      // Check maximum order value
      if (method.restrictions?.maxOrderValue && orderTotal > method.restrictions.maxOrderValue) {
        return false;
      }
      
      // Check general min/max amount
      if (method.config?.minAmount && orderTotal < method.config.minAmount) {
        return false;
      }
      
      if (method.config?.maxAmount && orderTotal > method.config.maxAmount) {
        return false;
      }
      
      return true;
    });

    // Calculate processing fees for each method
    const methodsWithFees = filteredMethods.map(method => {
      let processingFee = 0;
      
      if (method.config?.processingFee) {
        if (method.config.processingFeeType === 'percentage') {
          processingFee = (orderTotal * method.config.processingFee) / 100;
        } else {
          processingFee = method.config.processingFee;
        }
      }
      
      // Add COD charges if applicable
      if (method.name === 'Cash on Delivery' && method.config?.codCharges) {
        processingFee += method.config.codCharges;
      }
      
      return {
        ...method,
        processingFee: Math.round(processingFee * 100) / 100, // Round to 2 decimal places
        totalAmount: orderTotal + processingFee
      };
    });

    res.json({ 
      success: true, 
      paymentMethods: methodsWithFees 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment methods' 
    });
  }
};

// Get payment method by ID
export const getPaymentMethodById = async (req, res) => {
  try {
    const { id } = req.params;
    const paymentMethod = await PaymentMethod.findById(id);
    
    if (!paymentMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }
    
    res.json({ 
      success: true, 
      paymentMethod 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payment method' 
    });
  }
};

// Create Razorpay order
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;
    
    if (!amount || amount < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid amount' 
      });
    }
    
    // Get Razorpay payment method config
    const razorpayMethod = await PaymentMethod.findOne({ 
      name: 'Razorpay', 
      isActive: true 
    });
    
    if (!razorpayMethod) {
      console.log('💡 Solution: Run seed script or configure Razorpay in Admin Panel > Payments > Integration');
      return res.status(400).json({ 
        success: false, 
        message: 'Razorpay payment method not found. Please contact administrator to configure payment gateway.' 
      });
    }
    
    if (!razorpayMethod.config?.razorpayKeyId || !razorpayMethod.config?.razorpayKeySecret) {
      console.log('💡 Solution: Configure Razorpay Key ID and Key Secret in Admin Panel > Payments > Integration');
      console.log('Current config:', {
        hasKeyId: !!razorpayMethod.config?.razorpayKeyId,
        hasKeySecret: !!razorpayMethod.config?.razorpayKeySecret
      });
      return res.status(400).json({ 
        success: false, 
        message: 'Razorpay credentials not configured. Please configure Razorpay Key ID and Key Secret in Admin Panel.' 
      });
    }
    
    // Import Razorpay dynamically
    const Razorpay = (await import('razorpay')).default;
    
    const razorpay = new Razorpay({
      key_id: razorpayMethod.config.razorpayKeyId,
      key_secret: razorpayMethod.config.razorpayKeySecret,
    });
    
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
    };
    
    const order = await razorpay.orders.create(options);
    
    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          key_id: razorpayMethod.config.razorpayKeyId
        }
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create payment order' 
    });
  }
};

// Verify Razorpay payment
export const verifyRazorpayPayment = async (req, res) => {
  try {
    console.log('🔍 Starting payment verification...');
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId, frequentlyBoughtTogether } = req.body;
    const userId = req.user?.id; // Get authenticated user ID
    
    console.log('📋 Payment verification data:', {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature: razorpay_signature ? '***' : undefined,
      addressId,
      userId
    });
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User authentication required for payment verification' 
      });
    }
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing payment verification parameters' 
      });
    }
    
    // Get Razorpay payment method config
    const razorpayMethod = await PaymentMethod.findOne({ 
      name: 'Razorpay', 
      isActive: true 
    });
    
    if (!razorpayMethod || !razorpayMethod.config?.razorpayKeySecret) {
      return res.status(400).json({ 
        success: false, 
        message: 'Razorpay is not configured' 
      });
    }
    
    // Import crypto for signature verification
    const crypto = await import('crypto');
    
    const text = `${razorpay_order_id}|${razorpay_payment_id}`;
    const signature = crypto
      .createHmac('sha256', razorpayMethod.config.razorpayKeySecret)
      .update(text)
      .digest('hex');
    
    console.log('🔐 Signature verification:', {
      expectedSignature: signature.substring(0, 10) + '...',
      receivedSignature: razorpay_signature.substring(0, 10) + '...',
      match: signature === razorpay_signature
    });
    
    if (signature === razorpay_signature) {
      console.log('✅ Payment signature verified successfully');
      // Import required models
      const Order = (await import('../../models/order.js')).default;
      const Cart = (await import('../../models/cart.js')).default;
      const Address = (await import('../../models/address.js')).default;
      const Product = (await import('../../models/product.js')).default;
      
      // Get user's cart
      console.log('🛒 Fetching cart for user:', userId);
      const cart = await Cart.findOne({ user: userId }).populate('items.product');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cart is empty'
        });
      }
      console.log('✅ Cart found with', cart.items.length, 'items');

      // Get address
      console.log('📍 Fetching address:', addressId);
      const address = await Address.findOne({ _id: addressId, user: userId });
      if (!address) {
        return res.status(400).json({
          success: false,
          message: 'Address not found'
        });
      }
      console.log('✅ Address found:', address.city);

      // Process frequently bought together items first to calculate their total
      let frequentlyBoughtItems = [];
      let frequentlyBoughtTotal = 0;
      
      // Create a map of cart item IDs to order item indices
      const cartItemIdToOrderIndex = {};
      const productIdToCartItemId = {};
      
      cart.items.forEach((cartItem, index) => {
        // Use the cart item's _id
        if (cartItem._id) {
          cartItemIdToOrderIndex[cartItem._id.toString()] = index;
        }
        // Also map by product ID for fallback matching
        if (cartItem.product && cartItem.product._id) {
          productIdToCartItemId[cartItem.product._id.toString()] = cartItem._id?.toString();
        }
      });
      
      console.log('📦 Cart item ID mapping:', cartItemIdToOrderIndex);
      console.log('📦 Product ID to cart item ID mapping:', productIdToCartItemId);
      
      // Process user-selected frequently bought together items from frontend
      if (frequentlyBoughtTogether && typeof frequentlyBoughtTogether === 'object') {
        console.log('📦 Processing user-selected frequently bought together items:', JSON.stringify(frequentlyBoughtTogether, null, 2));
        console.log('📦 Cart items:', cart.items.map(item => ({ _id: item._id?.toString(), productId: item.product?._id?.toString() })));
        
        // Process each cart item's frequently bought together products
        for (const [cartItemId, productIds] of Object.entries(frequentlyBoughtTogether)) {
          console.log(`📦 Processing cartItemId: ${cartItemId}, productIds:`, productIds);
          
          // Handle undefined key - use first cart item's ID
          let actualCartItemId = cartItemId;
          if (!cartItemId || cartItemId === 'undefined' || cartItemId === 'null') {
            console.log(`⚠️ Invalid cartItemId detected: ${cartItemId}, using first cart item as fallback`);
            if (cart.items.length > 0 && cart.items[0]._id) {
              actualCartItemId = cart.items[0]._id.toString();
            } else {
              console.log(`❌ No cart items available, skipping this entry`);
              continue;
            }
          }
          
          // Check if productIds is an array
          const productIdsArray = Array.isArray(productIds) ? productIds : [];
          
          if (productIdsArray.length > 0) {
            // Try to find matching cart item - first by cartItemId, then by productId
            let matchedCartItemId = actualCartItemId;
            
            // First try exact match by cartItemId
            if (cartItemIdToOrderIndex[actualCartItemId]) {
              matchedCartItemId = actualCartItemId;
              console.log(`✅ Found exact match for cartItemId: ${actualCartItemId}`);
            } else {
              // If cartItemId doesn't match, try to find by productId
              const matchingCartItem = cart.items.find(item => 
                item.product?._id?.toString() === actualCartItemId || 
                item._id?.toString() === actualCartItemId
              );
              if (matchingCartItem && matchingCartItem._id) {
                matchedCartItemId = matchingCartItem._id.toString();
                console.log(`✅ Matched cartItemId ${actualCartItemId} to ${matchedCartItemId} by product`);
              } else {
                // If still no match, use the first cart item's ID as fallback
                if (cart.items.length > 0 && cart.items[0]._id) {
                  matchedCartItemId = cart.items[0]._id.toString();
                  console.log(`⚠️ No match found for cartItemId ${actualCartItemId}, using first cart item ID: ${matchedCartItemId} as fallback`);
                }
              }
            }
            
            // Fetch product details for each productId
            for (const productId of productIdsArray) {
              try {
                // Check if it's a manual product SKU (starts with "MANUAL-")
                if (productId && productId.toString().startsWith('MANUAL-')) {
                  console.log(`🔍 Detected manual product SKU: ${productId}`);
                  
                  // Try to find this manual product in the cart item's product's manualFrequentlyBoughtTogether
                  const cartItemForManual = cart.items.find(item => 
                    item._id?.toString() === matchedCartItemId || 
                    item.product?._id?.toString() === actualCartItemId
                  );
                  
                  if (cartItemForManual && cartItemForManual.product) {
                    // Check cart's product data first
                    let manualProductData = null;
                    
                    if (cartItemForManual.product.manualFrequentlyBoughtTogether) {
                      const manualProducts = Array.isArray(cartItemForManual.product.manualFrequentlyBoughtTogether) 
                        ? cartItemForManual.product.manualFrequentlyBoughtTogether 
                        : [];
                      manualProductData = manualProducts.find(mp => mp.sku === productId);
                    }
                    
                    // If not found in cart, fetch from DB
                    if (!manualProductData && cartItemForManual.product._id) {
                      const productFromDB = await Product.findById(cartItemForManual.product._id);
                      if (productFromDB && productFromDB.manualFrequentlyBoughtTogether) {
                        const manualProducts = Array.isArray(productFromDB.manualFrequentlyBoughtTogether) 
                          ? productFromDB.manualFrequentlyBoughtTogether 
                          : [];
                        manualProductData = manualProducts.find(mp => mp.sku === productId);
                      }
                    }
                    
                    if (manualProductData) {
                      const productPrice = Math.round(manualProductData.discountPrice || manualProductData.price || 0);
                      
                      // Check if already added
                      const alreadyAdded = frequentlyBoughtItems.some(item => 
                        item.manualProduct?.sku === productId && item.cartItemId === matchedCartItemId
                      );
                      
                      if (!alreadyAdded && productPrice > 0) {
                        frequentlyBoughtTotal += productPrice;
                        frequentlyBoughtItems.push({
                          cartItemId: matchedCartItemId,
                          product: null,
                          quantity: 1,
                          price: productPrice,
                          manualProduct: {
                            productName: manualProductData.productName,
                            images: manualProductData.images || [],
                            price: manualProductData.price || 0,
                            discountPrice: manualProductData.discountPrice || null,
                            sku: manualProductData.sku || productId,
                            isManual: true
                          }
                        });
                        console.log(`✅ Added user-selected manual frequently bought item: ${manualProductData.productName} (₹${productPrice}) for cartItemId: ${matchedCartItemId}`);
                      }
                    } else {
                      console.log(`⚠️ Manual product with SKU ${productId} not found in product's manualFrequentlyBoughtTogether`);
                    }
                  }
                } else {
                  // Regular product ID - fetch from database
                  const product = await Product.findById(productId);
                  if (product) {
                    const productPrice = Math.round(product.discountPrice || product.price);
                    frequentlyBoughtTotal += productPrice; // Add to total
                    frequentlyBoughtItems.push({
                      cartItemId: matchedCartItemId,
                      product: product._id,
                      quantity: 1,
                      price: productPrice
                    });
                    console.log(`✅ Added user-selected frequently bought item: ${product.productName} (₹${productPrice}) for cartItemId: ${matchedCartItemId}`);
                  } else {
                    console.error(`❌ Product not found: ${productId}`);
                  }
                }
              } catch (error) {
                console.error(`❌ Error fetching product ${productId}:`, error);
              }
            }
          } else {
            console.log(`⚠️ Empty productIds array for cartItemId: ${cartItemId}`);
          }
        }
      } else {
        console.log('⚠️ No user-selected frequently bought together items provided');
      }
      
      // Process product's frequentlyBoughtTogether and manualFrequentlyBoughtTogether from database
      // Merge both arrays for each cart item
      console.log('📦 Processing product-level frequently bought together items from database...');
      for (const cartItem of cart.items) {
        if (!cartItem.product || !cartItem.product._id) continue;
        
        const productId = cartItem.product._id.toString();
        const cartItemId = cartItem._id?.toString();
        
        try {
          // First check if cart's product already has manualFrequentlyBoughtTogether data
          const cartProduct = cartItem.product;
          let productManualFBTFromCart = [];
          
          // Check cart's product data first (this is the source of truth from cart)
          // Convert to object if it's a Mongoose document to access all fields
          const cartProductObj = cartProduct?.toObject ? cartProduct.toObject() : cartProduct;
          
          console.log(`🔍 DEBUG: Checking cart product for ${productId}:`, {
            hasCartProduct: !!cartProduct,
            isMongooseDoc: cartProduct?.toObject ? true : false,
            productName: cartProductObj?.productName,
            hasManualFBT: !!cartProductObj?.manualFrequentlyBoughtTogether,
            manualFBTType: typeof cartProductObj?.manualFrequentlyBoughtTogether,
            manualFBTIsArray: Array.isArray(cartProductObj?.manualFrequentlyBoughtTogether),
            manualFBTLength: cartProductObj?.manualFrequentlyBoughtTogether ? (Array.isArray(cartProductObj.manualFrequentlyBoughtTogether) ? cartProductObj.manualFrequentlyBoughtTogether.length : 0) : 0
          });
          
          if (cartProductObj && cartProductObj.manualFrequentlyBoughtTogether) {
            productManualFBTFromCart = Array.isArray(cartProductObj.manualFrequentlyBoughtTogether) 
              ? cartProductObj.manualFrequentlyBoughtTogether 
              : [];
            console.log(`✅ Found ${productManualFBTFromCart.length} manual products in cart's product data for ${productId}:`, JSON.stringify(productManualFBTFromCart, null, 2));
          } else {
            console.log(`⚠️ No manualFrequentlyBoughtTogether found in cart product for ${productId}`);
          }
          
          // Fetch full product details with populated frequentlyBoughtTogether (will get fresh data from DB)
          const productFromDB = await Product.findById(productId)
            .populate('frequentlyBoughtTogether', 'productName images price discountPrice');
          
          if (!productFromDB) {
            console.log(`⚠️ Product not found: ${productId}`);
            continue;
          }
          
          // Use product from DB for processing, but prefer manualFBT from cart if available
          const product = productFromDB;
          
          // Get frequentlyBoughtTogether (array of product IDs/objects) from DB
          const productFBT = product.frequentlyBoughtTogether || [];
          const productFBTArray = Array.isArray(productFBT) ? productFBT : [];
          
          // Get manualFrequentlyBoughtTogether - prefer cart data, fallback to DB data
          let productManualFBT = productManualFBTFromCart.length > 0 
            ? productManualFBTFromCart 
            : (product.manualFrequentlyBoughtTogether || []);
          const productManualFBTArray = Array.isArray(productManualFBT) ? productManualFBT : [];
          
          // Debug: Log the full product to see if manualFrequentlyBoughtTogether exists
          console.log(`🔍 DEBUG: Product processing for ${productId}:`, {
            productName: product.productName || cartProductObj?.productName,
            hasManualFBTInCart: productManualFBTFromCart.length > 0,
            hasManualFBTInDB: !!product.manualFrequentlyBoughtTogether,
            manualFBTFromCartCount: productManualFBTFromCart.length,
            manualFBTFromDBCount: product.manualFrequentlyBoughtTogether ? (Array.isArray(product.manualFrequentlyBoughtTogether) ? product.manualFrequentlyBoughtTogether.length : 0) : 0,
            finalManualFBTCount: productManualFBTArray.length
          });
          
          console.log(`📦 Product ${product.productName || cartProductObj?.productName}:`);
          console.log(`   - frequentlyBoughtTogether: ${productFBTArray.length} items`);
          console.log(`   - manualFrequentlyBoughtTogether: ${productManualFBTArray.length} items (${productManualFBTFromCart.length > 0 ? 'from cart' : 'from DB'})`);
          if (productManualFBTArray.length > 0) {
            console.log(`   - manualFrequentlyBoughtTogether data:`, JSON.stringify(productManualFBTArray, null, 2));
          }
          
          // Process frequentlyBoughtTogether (regular products)
          for (const fbtItem of productFBTArray) {
            if (!fbtItem) continue;
            
            // Check if it's already added (avoid duplicates)
            const productIdToCheck = fbtItem._id ? fbtItem._id.toString() : fbtItem.toString();
            const alreadyAdded = frequentlyBoughtItems.some(item => 
              item.product?.toString() === productIdToCheck && item.cartItemId === cartItemId
            );
            
            if (!alreadyAdded) {
              let productPrice = 0;
              let productObj = null;
              
              // If fbtItem is already populated (object), use it directly
              if (typeof fbtItem === 'object' && fbtItem._id) {
                productPrice = Math.round(fbtItem.discountPrice || fbtItem.price || 0);
                productObj = fbtItem._id;
              } else {
                // If it's just an ID, fetch the product
                const fbtProduct = await Product.findById(fbtItem);
                if (fbtProduct) {
                  productPrice = Math.round(fbtProduct.discountPrice || fbtProduct.price);
                  productObj = fbtProduct._id;
                }
              }
              
              if (productObj && productPrice > 0 && cartItemId) {
                frequentlyBoughtTotal += productPrice;
                frequentlyBoughtItems.push({
                  cartItemId: cartItemId,
                  product: productObj,
                  quantity: 1,
                  price: productPrice
                });
                console.log(`✅ Added product-level frequently bought item: ${productIdToCheck} (₹${productPrice}) for cartItemId: ${cartItemId}`);
              }
            }
          }
          
          // Process manualFrequentlyBoughtTogether (manual products)
          for (const manualItem of productManualFBTArray) {
            if (!manualItem) continue;
            
            // Check if it's already added (avoid duplicates) - check by productName and cartItemId
            const alreadyAdded = frequentlyBoughtItems.some(item => 
              item.manualProduct?.productName === manualItem.productName && 
              item.cartItemId === cartItemId
            );
            
            if (!alreadyAdded) {
              const productPrice = Math.round(manualItem.discountPrice || manualItem.price || 0);
              
              if (productPrice > 0 && cartItemId) {
                frequentlyBoughtTotal += productPrice;
                frequentlyBoughtItems.push({
                  cartItemId: cartItemId,
                  product: null, // Manual products don't have a product reference
                  quantity: 1,
                  price: productPrice,
                  manualProduct: {
                    productName: manualItem.productName,
                    images: manualItem.images || [],
                    price: manualItem.price || 0,
                    discountPrice: manualItem.discountPrice || null,
                    sku: manualItem.sku || '',
                    isManual: true
                  }
                });
                console.log(`✅ Added manual frequently bought item: ${manualItem.productName} (₹${productPrice}) for cartItemId: ${cartItemId}`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error processing FBT for product ${productId}:`, error);
        }
      }
      
      console.log(`📦 Total frequently bought items processed: ${frequentlyBoughtItems.length}, Total: ₹${frequentlyBoughtTotal}`);
      if (frequentlyBoughtItems.length > 0) {
        console.log(`📦 Frequently bought items details:`, JSON.stringify(frequentlyBoughtItems, null, 2));
      } else {
        console.log(`⚠️ WARNING: No frequently bought items were processed! Check logs above to see why.`);
      }

      // Calculate totals with discount, including warranty and frequently bought together
      let warrantyTotal = 0;
      cart.items.forEach((item) => {
        if (item.warranty && typeof item.warranty === 'object' && item.warranty.price) {
          warrantyTotal += Math.round(item.warranty.price * item.quantity);
        }
      });

      const subtotal = cart.items.reduce((sum, item) => {
        // Use variant price if available (from cart item), otherwise use product discountPrice or price
        // Cart item already has the correct price (variant price if variant exists, otherwise product price)
        const itemPrice = Math.round(item.price); // Use cart item price which already has variant price
        return sum + (itemPrice * item.quantity);
      }, 0) + warrantyTotal + frequentlyBoughtTotal; // Add warranty and frequently bought together total to subtotal
      const discountAmount = Math.round(cart.discountAmount || 0);
      const shippingCharges = 0; // Free shipping for all orders
      const total = Math.round(subtotal - discountAmount + shippingCharges);

      console.log('Order totals:', { subtotal, discountAmount, shippingCharges, total, warrantyTotal, frequentlyBoughtTotal });

      // Create order items from cart items (includes warranty)
      const orderItems = cart.items.map(item => {
        // Extract discount price from variant if available
        let discountPrice = null;
        if (item.variant && item.variant.discountPrice) {
          discountPrice = Math.round(item.variant.discountPrice);
        } else if (item.product.discountPrice && item.product.discountPrice !== item.product.price) {
          discountPrice = Math.round(item.product.discountPrice);
        }
        
        return {
          product: item.product._id,
          quantity: item.quantity,
          price: Math.round(item.price),
          discountPrice: discountPrice,
          variant: item.variant ? JSON.stringify(item.variant) : null,
          warranty: item.warranty || null,
          isFrequentlyBoughtTogether: false
        };
      });
      
      // Add frequently bought together items to order items array (like warranty items)
      if (frequentlyBoughtItems && frequentlyBoughtItems.length > 0) {
        console.log(`📦 Adding ${frequentlyBoughtItems.length} frequently bought together items to order items array`);
        
        frequentlyBoughtItems.forEach(fbtItem => {
          // For regular products (have product reference)
          if (fbtItem.product) {
            orderItems.push({
              product: fbtItem.product,
              quantity: fbtItem.quantity || 1,
              price: fbtItem.price,
              discountPrice: null,
              variant: null,
              warranty: null,
              isFrequentlyBoughtTogether: true,
              manualProduct: null
            });
            console.log(`✅ Added frequently bought together product to order items: ${fbtItem.product}`);
          } 
          // For manual products (no product reference, has manualProduct data)
          else if (fbtItem.manualProduct) {
            orderItems.push({
              product: null, // Manual products don't have product reference
              quantity: fbtItem.quantity || 1,
              price: fbtItem.price,
              discountPrice: fbtItem.manualProduct.discountPrice || null,
              variant: null,
              warranty: null,
              isFrequentlyBoughtTogether: true,
              manualProduct: {
                productName: fbtItem.manualProduct.productName,
                images: fbtItem.manualProduct.images || [],
                price: fbtItem.manualProduct.price || 0,
                discountPrice: fbtItem.manualProduct.discountPrice || null,
                sku: fbtItem.manualProduct.sku || '',
                isManual: true
              }
            });
            console.log(`✅ Added frequently bought together manual product to order items: ${fbtItem.manualProduct.productName}`);
          }
        });
      }

      // Calculate shipment details from products
      let shipmentDetails = null;
      
      // Fetch full product details with shipment fields
      const productsWithShipment = await Promise.all(
        cart.items.map(async (item) => {
          const product = await Product.findById(item.product._id).select('shipmentLength shipmentWidth shipmentHeight shipmentWeight');
          return {
            product,
            quantity: item.quantity
          };
        })
      );

      // If single product order, use product's shipment details
      if (cart.items.length === 1) {
        const product = productsWithShipment[0].product;
        if (product && product.shipmentLength && product.shipmentWidth && 
            product.shipmentHeight && product.shipmentWeight) {
          shipmentDetails = {
            length: product.shipmentLength,
            width: product.shipmentWidth,
            height: product.shipmentHeight,
            weight: product.shipmentWeight * productsWithShipment[0].quantity
          };
          console.log('✅ Auto-filled shipment details from single product:', shipmentDetails);
        }
      } else {
        // For multiple products, always calculate combined dimensions and weight
        // Use the largest dimensions and sum of weights from available products
        let maxLength = 0;
        let maxWidth = 0;
        let maxHeight = 0;
        let totalWeight = 0;
        let productsWithData = 0;

        for (const item of productsWithShipment) {
          if (item.product && item.product.shipmentLength && item.product.shipmentWidth && 
              item.product.shipmentHeight && item.product.shipmentWeight) {
            maxLength = Math.max(maxLength, item.product.shipmentLength);
            maxWidth = Math.max(maxWidth, item.product.shipmentWidth);
            maxHeight = Math.max(maxHeight, item.product.shipmentHeight);
            totalWeight += (item.product.shipmentWeight * item.quantity);
            productsWithData++;
          }
        }

        // Always set combined shipment details for multiple products
        // If some products are missing data, use available products' data
        if (maxLength > 0 && maxWidth > 0 && maxHeight > 0 && totalWeight > 0) {
          shipmentDetails = {
            length: maxLength,
            width: maxWidth,
            height: maxHeight,
            weight: totalWeight
          };
          console.log(`✅ Auto-calculated combined shipment details from ${productsWithData} products:`, shipmentDetails);
        } else {
          // If no products have shipment data, use default values (will be filled manually later)
          console.log('⚠️ No products have shipment details - using default values');
          shipmentDetails = {
            length: 0,
            width: 0,
            height: 0,
            weight: 0
          };
        }
      }

      // Determine payment method name based on the payment type
      let paymentMethodName = 'razorpay';
      
      // Try to get payment method from Razorpay order notes
      try {
        // Import Razorpay to get order details
        const Razorpay = (await import('razorpay')).default;
        const razorpay = new Razorpay({
          key_id: razorpayMethod.config.razorpayKeyId,
          key_secret: razorpayMethod.config.razorpayKeySecret,
        });
        
        // Get order details from Razorpay
        const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
        
        if (razorpayOrder.notes && razorpayOrder.notes.payment_method) {
          paymentMethodName = razorpayOrder.notes.payment_method;
        }
      } catch (error) {
        console.log('Could not fetch Razorpay order details, using default payment method name');
      }

      // Generate unique order number
      const generateOrderNumber = () => {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `ORD-${timestamp}${random}`;
      };

      let orderNumber;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      // Ensure order number is unique
      while (!isUnique && attempts < maxAttempts) {
        orderNumber = generateOrderNumber();
        const existingOrder = await Order.findOne({ orderNumber });
        if (!existingOrder) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return res.status(500).json({
          success: false,
          message: 'Failed to generate unique order number'
        });
      }

      console.log('✅ Generated unique order number:', orderNumber);


      // Create order
      console.log('📦 Creating order with data:', {
        userId,
        orderNumber,
        itemsCount: orderItems.length,
        frequentlyBoughtCount: frequentlyBoughtItems.length,
        paymentMethod: paymentMethodName,
        subtotal,
        discountAmount,
        total,
        addressCity: address.city
      });
      
      const order = new Order({
        orderNumber,
        user: userId,
        items: orderItems,
        address: {
          name: address.name,
          mobile: address.mobile,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          country: address.country
        },
        paymentMethod: paymentMethodName,
        paymentStatus: 'completed',
        orderStatus: 'pending', // Order remains pending until admin confirms
        subtotal,
        discountAmount,
        couponCode: cart.coupon?.code || null,
        couponDiscount: cart.coupon?.discount ? Math.round(cart.coupon.discount) : 0,
        promoCode: cart.promoCode?.code || null,
        promoId: cart.promoCode?.promoId || null,
        promoDiscount: cart.promoCode?.discount ? Math.round(cart.promoCode.discount) : 0,
        giftVoucherCode: cart.giftVoucher?.code || null,
        giftVoucherId: cart.giftVoucher?.giftVoucherId || null,
        giftVoucherDiscount: cart.giftVoucher?.discount ? Math.round(cart.giftVoucher.discount) : 0,
        shippingCharges,
        total,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        shipmentDetails: shipmentDetails || undefined,
        frequentlyBoughtTogether: frequentlyBoughtItems.length > 0 ? frequentlyBoughtItems : undefined
      });

      console.log('💾 Saving order to database...');
      await order.save();
      console.log('✅ Order saved successfully with ID:', order._id);

      // Decrease stock for each product in the order (including variant stock)
      console.log('Decreasing stock for order items...');
      for (const item of orderItems) {
        try {
          const product = await Product.findById(item.product);
          if (product) {
            // If item has a variant, decrease variant stock
            if (item.variant) {
              try {
                const variantData = JSON.parse(item.variant);
                // Find the matching variant in product.variants array
                if (product.variants && Array.isArray(product.variants)) {
                  const variantIndex = product.variants.findIndex(v => {
                    // Match by variantName or by comparing attributes
                    if (variantData.variantName && v.variantName === variantData.variantName) {
                      return true;
                    }
                    // Match by attributes if variantName doesn't match
                    if (variantData.attributes && v.attributes) {
                      const variantAttrs = JSON.stringify(variantData.attributes);
                      const productVariantAttrs = JSON.stringify(v.attributes);
                      return variantAttrs === productVariantAttrs;
                    }
                    return false;
                  });
                  
                  if (variantIndex !== -1) {
                    const variant = product.variants[variantIndex];
                    const newVariantStock = Math.max(0, (variant.stock || 0) - item.quantity);
                    
                    // Update variant stock using $set operator
                    const updateQuery = {};
                    updateQuery[`variants.${variantIndex}.stock`] = newVariantStock;
                    
                    await Product.findByIdAndUpdate(item.product, { 
                      $set: updateQuery
                    });
                    
                    console.log(`Variant stock decreased for ${product.productName} - ${variant.variantName || 'Variant'}: ${variant.stock || 0} → ${newVariantStock}`);
                  } else {
                    console.log(`⚠️ Variant not found for ${product.productName}, decreasing product stock instead`);
                    // Fallback to product stock if variant not found
                    const newStock = Math.max(0, product.stock - item.quantity);
                    await Product.findByIdAndUpdate(item.product, { 
                      stock: newStock 
                    });
                    console.log(`Stock decreased for ${product.productName}: ${product.stock} → ${newStock}`);
                  }
                } else {
                  // No variants array, decrease product stock
                  const newStock = Math.max(0, product.stock - item.quantity);
                  await Product.findByIdAndUpdate(item.product, { 
                    stock: newStock 
                  });
                  console.log(`Stock decreased for ${product.productName}: ${product.stock} → ${newStock}`);
                }
              } catch (parseError) {
                console.log(`⚠️ Error parsing variant data for ${product.productName}, decreasing product stock instead:`, parseError.message);
                // Fallback to product stock if variant parsing fails
                const newStock = Math.max(0, product.stock - item.quantity);
                await Product.findByIdAndUpdate(item.product, { 
                  stock: newStock 
                });
                console.log(`Stock decreased for ${product.productName}: ${product.stock} → ${newStock}`);
              }
            } else {
              // No variant, decrease product stock
              const newStock = Math.max(0, product.stock - item.quantity);
              await Product.findByIdAndUpdate(item.product, { 
                stock: newStock 
              });
              console.log(`Stock decreased for ${product.productName}: ${product.stock} → ${newStock}`);
            }
            
            // Trigger immediate stock check for this product
            try {
              const stockMonitoringService = (await import('../../services/stockMonitoringService.js')).default;
              await stockMonitoringService.checkProductStock(item.product);
            } catch (error) {
            }
          }
        } catch (error) {
          console.error(`Error decreasing stock for item:`, error);
        }
      }
      console.log('Stock decrease completed for all items');

      // Increment usedCount for promo code if applied
      if (order.promoCode) {
        try {
          const Promo = (await import('../../models/promo.js')).default;
          await Promo.findOneAndUpdate(
            { code: order.promoCode },
            { $inc: { usedCount: 1 } }
          );
          console.log(`✅ Incremented usedCount for promo code: ${order.promoCode}`);
        } catch (error) {
          console.error(`❌ Error incrementing promo code usedCount:`, error);
          // Don't fail order creation if this fails
        }
      }

      // Increment usedCount for gift voucher if applied
      if (order.giftVoucherCode) {
        try {
          const GiftVoucher = (await import('../../models/giftVoucher.js')).default;
          await GiftVoucher.findOneAndUpdate(
            { code: order.giftVoucherCode },
            { $inc: { usedCount: 1 } }
          );
          console.log(`✅ Incremented usedCount for gift voucher: ${order.giftVoucherCode}`);
        } catch (error) {
          console.error(`❌ Error incrementing gift voucher usedCount:`, error);
          // Don't fail order creation if this fails
        }
      }

      // Order remains pending after payment - no automatic logistics creation
      console.log('✅ Payment completed successfully. Order status remains pending as per business requirement.');

      // Send order booking notification
      try {
        console.log('🔔 Sending order booking notification for Razorpay payment...');
        
        // Get user details for notification
        const user = await User.findById(userId);
        
        // Create a complete order object with user data for notification
        const orderWithUser = {
          ...order.toObject(),
          user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            phone: user.phone
          }
        };
        
        // Refresh order data to get updated tracking information
        const updatedOrder = await Order.findById(order._id);
        const orderWithTracking = {
          ...updatedOrder.toObject(),
          user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            phone: user.phone
          }
        };
        
        console.log('📋 Order data for notification:', {
          orderId: orderWithTracking._id,
          userEmail: orderWithTracking.user?.email,
          userPhone: orderWithTracking.address?.mobile,
          orderStatus: orderWithTracking.orderStatus,
          trackingNumber: orderWithTracking.trackingNumber,
          estimatedDelivery: orderWithTracking.estimatedDelivery,
          total: orderWithTracking.total
        });
        
        // Check if notification service is available
        if (!notificationService) {
        } else {
          // Check if order has required data
          if (!orderWithTracking || !orderWithTracking.address) {
          } else {
            console.log('🚀 Calling notification service for order confirmation...');
            await notificationService.sendOrderStatusNotifications(orderWithTracking, orderWithTracking.orderStatus, orderWithTracking.trackingNumber);
            console.log('✅ Order confirmation notification sent successfully');
          }
        }
      } catch (notificationError) {
        console.log({
          message: notificationError.message,
          stack: notificationError.stack
        });
        // Don't fail the payment verification if notification fails
      }

      // Create transaction for Razorpay payment
      try {
        console.log('💰 Creating transaction for Razorpay payment:', order._id);
        await createTransactionForRazorpayOrder(order._id);
        console.log('✅ Transaction creation process completed');
      } catch (transactionError) {
        // Don't fail the payment verification if transaction creation fails
      }

      // Clear cart ONLY after successful order creation and all operations completed
      // This ensures cart is not cleared if any error occurs
      try {
        console.log('🧹 Clearing cart after successful order creation...');
        cart.items = [];
        cart.subtotal = 0;
        cart.total = 0;
        cart.discountAmount = 0;
        cart.coupon = null;
        await cart.save();
        console.log('✅ Cart cleared successfully');
      } catch (cartError) {
        console.error('❌ Error clearing cart:', cartError);
        // Don't fail the payment verification if cart clearing fails
        // Cart will be cleared on next successful order or manually
      }

      console.log('📤 Sending success response');
      
      // Populate order with all related data before sending response
      // items.product will populate ALL items including frequently bought items (which are also in items array)
      const populatedOrder = await Order.findById(order._id)
        .populate({
          path: 'items.product',
          select: 'productName images price discountPrice sku',
          // Handle null products (manual products have product: null)
          match: { _id: { $ne: null } }
        })
        .populate('items.warranty')
        // Frequently bought together field (separate field for backward compatibility)
        .populate({
          path: 'frequentlyBoughtTogether.product',
          select: 'productName images price discountPrice sku',
          match: { _id: { $ne: null } }
        })
        .populate('user', 'email name phone');
      
      console.log('📦 Populated order for Razorpay response:', {
        itemsCount: populatedOrder?.items?.length || 0,
        frequentlyBoughtCount: populatedOrder?.frequentlyBoughtTogether?.length || 0,
        hasItems: !!populatedOrder?.items,
        hasFrequentlyBought: !!populatedOrder?.frequentlyBoughtTogether,
        itemsWithProduct: populatedOrder?.items?.filter((item) => item.product && typeof item.product === 'object').length || 0,
        itemsWithManualProduct: populatedOrder?.items?.filter((item) => item.manualProduct).length || 0,
        frequentlyBoughtItems: populatedOrder?.items?.filter((item) => item.isFrequentlyBoughtTogether).length || 0
      });
      
      res.json({
        success: true,
        message: 'Payment verified and order created successfully',
        data: {
          order: populatedOrder
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }
  } catch (err) {
    console.log({
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify payment',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}; 