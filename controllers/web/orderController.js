import Order from '../../models/order.js';
import Cart from '../../models/cart.js';
import User from '../../models/user.js';
import Address from '../../models/address.js';
import PaymentMethod from '../../models/paymentMethod.js';
import notificationService from '../../services/notificationService.js';
import Product from '../../models/product.js';
import RewardPoints from '../../models/rewardPoints.js';
import logisticsService from '../../services/logisticsService.js';
import Banner from '../../models/banner.js';
import PreOrderNotification from '../../models/preOrderNotification.js';
import Warranty from '../../models/warranty.js';

// Create a new order
export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { addressId, paymentMethodId, couponCode, frequentlyBoughtTogether, rewardPointsDiscount } = req.body;

    console.log('=== ORDER CREATION DEBUG ===');
    console.log('Request body:', req.body);
    console.log('User ID:', userId);
    console.log('Address ID:', addressId);
    console.log('Payment Method ID:', paymentMethodId);
    console.log('📦 Frequently Bought Together received:', JSON.stringify(frequentlyBoughtTogether, null, 2));
    console.log('📦 Frequently Bought Together type:', typeof frequentlyBoughtTogether);
    console.log('📦 Frequently Bought Together is array?', Array.isArray(frequentlyBoughtTogether));
    console.log('📦 Frequently Bought Together keys:', frequentlyBoughtTogether ? Object.keys(frequentlyBoughtTogether) : 'null/undefined');

    // Validate required fields
    if (!addressId) {
      console.log('Missing addressId');
      return res.status(400).json({
        success: false,
        message: 'Address ID is required'
      });
    }

    if (!paymentMethodId) {
      console.log('Missing paymentMethodId');
      return res.status(400).json({
        success: false,
        message: 'Payment method ID is required'
      });
    }

    // Get user's cart
    console.log('Fetching cart for user:', userId);
    const cart = await Cart.findOne({ user: userId })
      .populate('items.product')
      .populate('items.warranty');
    console.log('Cart found:', cart ? 'Yes' : 'No');
    
    if (!cart) {
      console.log('No cart found for user:', userId);
      return res.status(400).json({
        success: false,
        message: 'Cart not found. Please add items to cart first.'
      });
    }

    if (!cart.items || cart.items.length === 0) {
      console.log('Cart is empty for user:', userId);
      return res.status(400).json({
        success: false,
        message: 'Cart is empty. Please add items to cart first.'
      });
    }

    console.log('Cart items count:', cart.items.length);
    console.log('Cart items:', cart.items.map(item => ({
      productId: item.product._id,
      productName: item.product.productName,
      quantity: item.quantity,
      price: item.price
    })));

    // Get user details
    console.log('Fetching user details for user:', userId);
    const user = await User.findById(userId);
    if (!user) {
      console.log('User not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    console.log('User found:', user.email);

    // Get user's addresses
    console.log('Fetching addresses for user:', userId);
    const addresses = await Address.find({ user: userId });
    console.log('Addresses found:', addresses.length);
    
    const selectedAddress = addresses.find(addr => addr._id.toString() === addressId);
    if (!selectedAddress) {
      console.log('Address not found:', addressId, 'for user:', userId);
      console.log('Available addresses:', addresses.map(addr => addr._id.toString()));
      return res.status(400).json({
        success: false,
        message: 'Invalid address'
      });
    }

    console.log('Selected address found:', selectedAddress.name);

    // Get payment method
    let paymentMethod;
    if (paymentMethodId === 'cod' || paymentMethodId === 'cash') {
      // Handle COD payment method
      paymentMethod = {
        _id: 'cod',
        name: 'cod',
        displayName: 'Cash on Delivery',
        description: 'Pay with cash when you receive your order'
      };
      console.log('Using COD payment method');
    } else if (paymentMethodId === 'razorpay') {
      // Handle Razorpay payment method
      paymentMethod = {
        _id: 'razorpay',
        name: 'razorpay',
        displayName: 'Credit/Debit Card',
        description: 'Pay securely with credit cards, debit cards'
      };
      console.log('Using Razorpay payment method');
    } else if (paymentMethodId === 'netbanking') {
      // Handle Net Banking payment method
      paymentMethod = {
        _id: 'netbanking',
        name: 'netbanking',
        displayName: 'Net Banking',
        description: 'Pay using your bank\'s internet banking'
      };
      console.log('Using Net Banking payment method');
    } else if (paymentMethodId === 'emi') {
      // Handle EMI payment method
      paymentMethod = {
        _id: 'emi',
        name: 'emi',
        displayName: 'EMI Payment',
        description: 'Pay in easy monthly installments with 0% interest'
      };
      console.log('Using EMI payment method');
    } else if (paymentMethodId === 'bnpl') {
      // Handle BNPL payment method
      paymentMethod = {
        _id: 'bnpl',
        name: 'bnpl',
        displayName: 'Buy Now Pay Later',
        description: 'Pay later with LazyPay, Simpl, ZestMoney and more'
      };
      console.log('Using BNPL payment method');
    } else if (paymentMethodId === 'wallet') {
      // Handle Digital Wallet payment method
      paymentMethod = {
        _id: 'wallet',
        name: 'wallet',
        displayName: 'Digital Wallets',
        description: 'Pay using Paytm, PhonePe, Google Pay, and other wallets'
      };
      console.log('Using Digital Wallet payment method');
    } else {
      // Try to find payment method by MongoDB ObjectId
      paymentMethod = await PaymentMethod.findById(paymentMethodId);
      if (!paymentMethod) {
        console.log('Payment method not found:', paymentMethodId);
        return res.status(400).json({
          success: false,
          message: 'Invalid payment method'
        });
      }
      console.log('Using database payment method:', paymentMethod.name);
    }

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
        
        if (cartProductObj && cartProductObj.manualFrequentlyBoughtTogether) {
          productManualFBTFromCart = Array.isArray(cartProductObj.manualFrequentlyBoughtTogether) 
            ? cartProductObj.manualFrequentlyBoughtTogether 
            : [];
          console.log(`✅ Found ${productManualFBTFromCart.length} manual products in cart's product data for ${productId}`, productManualFBTFromCart);
        } else {
          console.log(`⚠️ No manualFrequentlyBoughtTogether in cart product for ${productId}`, {
            hasCartProduct: !!cartProduct,
            hasCartProductObj: !!cartProductObj,
            keys: cartProductObj ? Object.keys(cartProductObj) : []
          });
        }
        
        // Fetch full product details with populated frequentlyBoughtTogether (will get fresh data from DB)
        const productFromDB = await Product.findById(productId)
          .populate('frequentlyBoughtTogether', 'productName images price discountPrice');
        
        if (!productFromDB) {
          console.log(`⚠️ Product not found: ${productId}`);
          continue;
        }
        
        // Get frequentlyBoughtTogether (array of product IDs/objects) from DB
        const productFBT = productFromDB.frequentlyBoughtTogether || [];
        const productFBTArray = Array.isArray(productFBT) ? productFBT : [];
        
        // Get manualFrequentlyBoughtTogether - prefer cart data, fallback to DB data
        let productManualFBT = productManualFBTFromCart.length > 0 
          ? productManualFBTFromCart 
          : (productFromDB.manualFrequentlyBoughtTogether || []);
        const productManualFBTArray = Array.isArray(productManualFBT) ? productManualFBT : [];
        
        // Debug: Log the full product to see if manualFrequentlyBoughtTogether exists
        console.log(`🔍 DEBUG: Product processing for ${productId}:`, {
          productName: productFromDB.productName || cartProduct?.productName,
          hasManualFBTInCart: productManualFBTFromCart.length > 0,
          hasManualFBTInDB: !!productFromDB.manualFrequentlyBoughtTogether,
          manualFBTFromCartCount: productManualFBTFromCart.length,
          manualFBTFromDBCount: productFromDB.manualFrequentlyBoughtTogether ? (Array.isArray(productFromDB.manualFrequentlyBoughtTogether) ? productFromDB.manualFrequentlyBoughtTogether.length : 0) : 0,
          finalManualFBTCount: productManualFBTArray.length
        });
        
        console.log(`📦 Product ${productFromDB.productName || cartProduct?.productName}:`);
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

    // Calculate totals using variant price if available, otherwise product price, including warranty prices and frequently bought together
    const subtotal = cart.items.reduce((sum, item) => {
      // Use variant price if available (from cart item), otherwise use product discountPrice or price
      // Cart item already has the correct price (variant price if variant exists, otherwise product price)
      const itemPrice = Math.round(item.price); // Use cart item price which already has variant price
      let itemTotal = itemPrice * item.quantity;
      
      // Add warranty price if exists
      if (item.warranty && typeof item.warranty === 'object' && item.warranty.price) {
        itemTotal += Math.round(item.warranty.price * item.quantity);
      }
      
      return sum + itemTotal;
    }, 0) + frequentlyBoughtTotal; // Add frequently bought together total to subtotal
    const discountAmount = Math.round(cart.discountAmount || 0);
    const rewardPointsDiscountAmount = rewardPointsDiscount ? Math.round(rewardPointsDiscount) : 0;
    const shippingCharges = 0; // Free shipping for all orders
    const total = Math.round(subtotal - discountAmount - rewardPointsDiscountAmount + shippingCharges);

    console.log('Order totals:', { subtotal, discountAmount, shippingCharges, total, frequentlyBoughtTotal });

    // Prepare order items from cart items (includes warranty)
    const orderItems = cart.items.map(item => {
      // Extract discount price from variant if available, otherwise from product
      let discountPrice = null;
      if (item.variant && item.variant.discountPrice) {
        discountPrice = Math.round(item.variant.discountPrice);
      } else if (item.product.discountPrice && item.product.discountPrice !== item.product.price) {
        discountPrice = Math.round(item.product.discountPrice);
      }
      
      return {
        product: item.product._id,
        quantity: item.quantity,
        price: Math.round(item.price), // Use cart item price which already has variant price
        discountPrice: discountPrice, // Add discount price for display
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
          weight: product.shipmentWeight * productsWithShipment[0].quantity // Multiply by quantity
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

    console.log('Creating order with data:', {
      orderNumber,
      user: userId,
      itemsCount: orderItems.length,
      frequentlyBoughtCount: frequentlyBoughtItems.length,
      frequentlyBoughtItems: frequentlyBoughtItems,
      address: selectedAddress.name,
      paymentMethod: paymentMethod.name,
      subtotal,
      shippingCharges,
      total
    });

    const orderData = {
      orderNumber,
      user: userId,
      items: orderItems,
      address: {
        name: selectedAddress.name,
        mobile: selectedAddress.mobile,
        addressLine1: selectedAddress.addressLine1,
        addressLine2: selectedAddress.addressLine2,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        country: selectedAddress.country
      },
      paymentMethod: paymentMethod.name,
      paymentStatus: paymentMethod.name === 'cod' ? 'pending' : 'pending',
      orderStatus: 'pending',
      subtotal,
      discountAmount,
      couponCode: cart.coupon?.code || couponCode || null,
      couponDiscount: cart.coupon?.discount ? Math.round(cart.coupon.discount) : 0,
      promoCode: cart.promoCode?.code || null,
      promoId: cart.promoCode?.promoId || null,
      promoDiscount: cart.promoCode?.discount ? Math.round(cart.promoCode.discount) : 0,
      giftVoucherCode: cart.giftVoucher?.code || null,
      giftVoucherId: cart.giftVoucher?.giftVoucherId || null,
      giftVoucherDiscount: cart.giftVoucher?.discount ? Math.round(cart.giftVoucher.discount) : 0,
      rewardPointsDiscount: rewardPointsDiscountAmount,
      shippingCharges,
      total,
      shipmentDetails: shipmentDetails || undefined
    };

    // Only add frequentlyBoughtTogether if we have items
    if (frequentlyBoughtItems.length > 0) {
      orderData.frequentlyBoughtTogether = frequentlyBoughtItems;
      console.log('✅ Adding frequently bought together items to order:', frequentlyBoughtItems.length, 'items');
    } else {
      console.log('⚠️ No frequently bought together items to add to order');
    }

    const order = new Order(orderData);

    console.log('Saving order to database...');
    console.log('📦 Order frequentlyBoughtTogether before save:', order.frequentlyBoughtTogether);
    await order.save();
    console.log('Order saved successfully with ID:', order._id);
    console.log('📦 Order frequentlyBoughtTogether after save:', order.frequentlyBoughtTogether);
    
    // Verify the saved order
    const savedOrder = await Order.findById(order._id).populate('frequentlyBoughtTogether.product', 'productName images price');
    console.log('📦 Verified saved order frequentlyBoughtTogether:', savedOrder?.frequentlyBoughtTogether);

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

    // Create transaction for COD order (non-blocking - don't fail order if this fails)
    if (paymentMethod.name === 'cod') {
      // Run transaction creation asynchronously without blocking order creation
      (async () => {
        try {
          console.log('💰 Creating transaction for COD order:', order._id);
          const { createTransactionForCODOrderPending } = await import('../admin/transactionController.js');
          const result = await createTransactionForCODOrderPending(order._id);
          if (result) {
            console.log('✅ Transaction created successfully for COD order');
          } else {
            console.log('⚠️ Transaction creation returned false (may already exist)');
          }
        } catch (transactionError) {
          // Silently log error - don't affect order creation
        }
      })();
    }

    // Decrease stock for each product in the order
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

    // Check stock alerts after stock decrease
    console.log('Checking stock alerts...');
    try {
      const stockMonitoringService = (await import('../../services/stockMonitoringService.js')).default;
      const stockAlertResult = await stockMonitoringService.checkOrderStockLevels(orderItems);
      console.log(`Stock alert check completed: ${stockAlertResult.alerts} alerts sent for ${stockAlertResult.checked} products`);
    } catch (error) {
    }

    // Note: Shipment creation is now handled separately after payment confirmation
    // This ensures order status remains 'pending' until payment is processed
    console.log('Order created with status: pending. Shipment will be created after payment confirmation.');

    // Send order booking notification
    try {
      console.log('🔔 Sending order booking notification...');
      
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
      
      console.log('📋 Order data for notification:', {
        orderId: orderWithUser._id,
        userEmail: orderWithUser.user?.email,
        userPhone: orderWithUser.address?.mobile,
        orderStatus: 'pending',
        total: orderWithUser.total
      });
      
      // Check if notification service is available
      if (!notificationService) {
        return;
      }
      
      // Check if order has required data
      if (!orderWithUser || !orderWithUser.address) {
        return;
      }
      
      console.log('🚀 Calling notification service for order booking...');
      await notificationService.sendOrderStatusNotifications(orderWithUser, 'pending');
      console.log('✅ Order booking notification sent successfully');
    } catch (notificationError) {
      console.log({
        message: notificationError.message,
        stack: notificationError.stack
      });
      // Don't fail the order creation if notification fails
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
      // Don't fail the order creation if cart clearing fails
      // Cart will be cleared on next successful order or manually
    }

    console.log('Sending success response...');
    
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
    
    console.log('📦 Populated order for response:', {
      itemsCount: populatedOrder?.items?.length || 0,
      frequentlyBoughtCount: populatedOrder?.frequentlyBoughtTogether?.length || 0,
      hasItems: !!populatedOrder?.items,
      hasFrequentlyBought: !!populatedOrder?.frequentlyBoughtTogether,
      itemsWithProduct: populatedOrder?.items?.filter((item) => item.product && typeof item.product === 'object').length || 0,
      itemsWithManualProduct: populatedOrder?.items?.filter((item) => item.manualProduct).length || 0,
      frequentlyBoughtItems: populatedOrder?.items?.filter((item) => item.isFrequentlyBoughtTogether).length || 0
    });
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order: populatedOrder
      }
    });

  } catch (error) {
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

// Create pre-order from banner click (Simple notification-based, no payment)
export const createPreOrder = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { productId, bannerId, name, email, phone, address, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Get product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.isPreOrder) {
      return res.status(400).json({
        success: false,
        message: 'This product is not available for pre-order'
      });
    }

    // Get user details if logged in
    let userName = name;
    let userEmail = email;
    let userPhone = phone;

    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        // Use provided details or fallback to user data
        userName = name || user.name || user.email?.split('@')[0] || 'Customer';
        userEmail = email || user.email;
        userPhone = phone || user.phone || '';
      }
    }

    // Validation
    if (!userName || !userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Check if user already has a notification for this product
    const existingNotification = userId
      ? await PreOrderNotification.findOne({ user: userId, product: productId, status: 'pending' })
      : await PreOrderNotification.findOne({ email: userEmail.toLowerCase(), product: productId, status: 'pending' });

    if (existingNotification) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for pre-order on this product'
      });
    }

    // Create pre-order notification
    const notification = await PreOrderNotification.create({
      product: productId,
      user: userId,
      name: userName,
      email: userEmail.toLowerCase(),
      phone: userPhone || '',
      address: address || '',
      quantity: quantity || 1,
      notificationChannels: {
        email: true,
        sms: userPhone ? true : false,
        whatsapp: userPhone ? true : false
      },
      status: 'pending'
    });

    // Send pre-order confirmation notifications (Email, WhatsApp, SMS)
    try {
      const { sendPreOrderNotification } = await import('../../services/notificationService.js');
      await sendPreOrderNotification(notification, product, 'registered');
    } catch (notifError) {
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      message: 'Pre-order registered successfully! You will be notified when the product becomes available.',
      data: notification
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create pre-order',
      error: error.message
    });
  }
};

// Get user's orders
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    // Build query based on status filter
    let query = { user: userId };
    
    if (status === 'upcoming') {
      // Show all orders that are NOT delivered
      query.orderStatus = { $ne: 'delivered' };
    } else if (status === 'delivered') {
      // Show only delivered orders
      query.orderStatus = 'delivered';
    }
    // If no status filter, show all orders

    const orders = await Order.find(query)
      .populate('items.product', 'productName images price discountPrice sku')
      .populate('items.warranty', 'name price duration')
      .populate('frequentlyBoughtTogether.product', 'productName images price discountPrice sku')
      .select('+deliveredAt')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Ensure user details are properly populated for all orders
    for (let order of orders) {
      if (order.user && (!order.user.name || !order.user.phone)) {
        const userDetails = await User.findById(order.user._id, 'email name phone');
        if (userDetails) {
          order.user = userDetails;
        }
      }
    }

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders,
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

// Get order by ID
export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    console.log('🔍 getOrderById - Request details:');
    console.log('- orderId:', orderId);
    console.log('- userId:', userId);

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate('items.product', 'productName images price discountPrice sku')
      .populate('items.warranty', 'name price duration')
      .populate('frequentlyBoughtTogether.product', 'productName images price discountPrice sku')
      .select('+deliveredAt');

    console.log('📦 Order found:', order ? 'Yes' : 'No');
    if (order) {
      console.log('- Order ID:', order._id);
      console.log('- Order Status:', order.orderStatus);
      console.log('- Order User ID:', order.user);
      console.log('- Request User ID:', userId);
    }

    // Ensure user details are properly populated
    if (order && order.user && (!order.user.name || !order.user.phone)) {
      const userDetails = await User.findById(order.user._id, 'email name phone');
      if (userDetails) {
        order.user = userDetails;
      }
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order retrieved successfully',
      data: {
        order
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Helper function to award reward points when order is delivered
export const awardRewardPointsForOrder = async (order) => {
  try {
    // Ensure order has user and total
    if (!order.user || !order.user._id) {
      console.error(`⚠️ Cannot award reward points: Order ${order._id} has no user or user._id`);
      return { success: false, error: 'No user found' };
    }
    
    if (!order.total || order.total <= 0) {
      console.error(`⚠️ Cannot award reward points: Order ${order._id} has invalid total: ${order.total}`);
      return { success: false, error: 'Invalid order total' };
    }
    
    const pointsToAdd = Math.floor(order.total * 0.01); // 1% of order total
    
    if (pointsToAdd <= 0) {
      console.log(`⚠️ Order ${order._id} total (₹${order.total}) is too small to award reward points (minimum ₹100 required)`);
      return { success: false, error: 'Order total too small' };
    }
    
    const userId = order.user._id.toString();
    console.log(`🎁 Awarding reward points: Order ${order._id}, User ${userId}, Total: ₹${order.total}, Points: ${pointsToAdd}`);
    
    let rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
    
    if (!rewardPoints) {
      // Create new reward points record
      console.log(`Creating new reward points record for user ${userId}`);
      rewardPoints = new RewardPoints({
        user: userId,
        entries: [],
        totalEarned: 0,
        totalRedeemed: 0,
        isActive: true
      });
    }

    // Check if points for this order already exist
    const existingEntry = rewardPoints.entries.find(
      entry => entry.orderId && entry.orderId.toString() === order._id.toString()
    );
    
    if (existingEntry) {
      console.log(`⚠️ Reward points already awarded for order ${order._id}, skipping...`);
      return { success: false, error: 'Points already awarded' };
    }
    
    // Create new entry for this order
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 6);

    const newEntry = {
      orderId: order._id,
      points: pointsToAdd,
      orderAmount: order.total,
      expiryDate: expiryDate,
      isActive: true
    };

    rewardPoints.entries.push(newEntry);
    rewardPoints.totalEarned += pointsToAdd;
    await rewardPoints.save();
    
    console.log(`✅ Awarded ${pointsToAdd} reward points to user ${userId} for order ${order._id} (expires: ${expiryDate.toDateString()})`);
    
    return { success: true, points: pointsToAdd };
  } catch (error) {
    console.error(`❌ Error awarding reward points for order ${order._id}:`, error);
    return { success: false, error: error.message };
  }
};

// Update order status (for admin use)
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, paymentStatus, trackingNumber, estimatedDelivery } = req.body;

    const order = await Order.findById(orderId).populate('user', 'email name');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const previousStatus = order.orderStatus;

    // Update fields if provided
    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (estimatedDelivery) order.estimatedDelivery = estimatedDelivery;

    await order.save();

    // Send notification if status changed
    if (orderStatus && orderStatus !== previousStatus) {
      try {
        await notificationService.sendOrderStatusNotifications(order, orderStatus, trackingNumber);
      } catch (notificationError) {
      }
    }

    // Decrease stock when order is confirmed (if not already done)
    if (orderStatus === 'confirmed' && previousStatus === 'pending') {
      console.log('Order confirmed, checking if stock needs to be decreased...');
      try {
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            // If item has a variant, decrease variant stock
            if (item.variant) {
              try {
                const variantData = typeof item.variant === 'string' ? JSON.parse(item.variant) : item.variant;
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
                    const currentVariantStock = variant.stock || 0;
                    const expectedVariantStock = Math.max(0, currentVariantStock - item.quantity);
                    
                    if (currentVariantStock >= item.quantity) {
                      // Update variant stock using $set operator
                      const updateQuery = {};
                      updateQuery[`variants.${variantIndex}.stock`] = expectedVariantStock;
                      
                      await Product.findByIdAndUpdate(item.product, { 
                        $set: updateQuery
                      });
                      
                      console.log(`Variant stock decreased for confirmed order - ${product.productName} - ${variant.variantName || 'Variant'}: ${currentVariantStock} → ${expectedVariantStock}`);
                    }
                  } else {
                    console.log(`⚠️ Variant not found for confirmed order - ${product.productName}, decreasing product stock instead`);
                    // Fallback to product stock if variant not found
                    const currentStock = product.stock;
                    const expectedStock = Math.max(0, currentStock - item.quantity);
                    
                    if (currentStock >= item.quantity) {
                      await Product.findByIdAndUpdate(item.product, { 
                        stock: expectedStock 
                      });
                      console.log(`Stock decreased for confirmed order - ${product.productName}: ${currentStock} → ${expectedStock}`);
                    }
                  }
                } else {
                  // No variants array, decrease product stock
                  const currentStock = product.stock;
                  const expectedStock = Math.max(0, currentStock - item.quantity);
                  
                  if (currentStock >= item.quantity) {
                    await Product.findByIdAndUpdate(item.product, { 
                      stock: expectedStock 
                    });
                    console.log(`Stock decreased for confirmed order - ${product.productName}: ${currentStock} → ${expectedStock}`);
                  }
                }
              } catch (parseError) {
                console.log(`⚠️ Error parsing variant data for confirmed order - ${product.productName}, decreasing product stock instead:`, parseError.message);
                // Fallback to product stock if variant parsing fails
                const currentStock = product.stock;
                const expectedStock = Math.max(0, currentStock - item.quantity);
                
                if (currentStock >= item.quantity) {
                  await Product.findByIdAndUpdate(item.product, { 
                    stock: expectedStock 
                  });
                  console.log(`Stock decreased for confirmed order - ${product.productName}: ${currentStock} → ${expectedStock}`);
                }
              }
            } else {
              // No variant, decrease product stock
              const currentStock = product.stock;
              const expectedStock = Math.max(0, currentStock - item.quantity);
              
              if (currentStock >= item.quantity) {
                await Product.findByIdAndUpdate(item.product, { 
                  stock: expectedStock 
                });
                console.log(`Stock decreased for confirmed order - ${product.productName}: ${currentStock} → ${expectedStock}`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error decreasing stock for confirmed order:', error);
      }
    }

    // Award reward points when order is delivered
    if (orderStatus === 'delivered' && previousStatus !== 'delivered') {
      try {
        // Use helper function to award reward points
        const rewardResult = await awardRewardPointsForOrder(order);
        
        // Award referral points for first order if user was referred
        if (rewardResult.success && order.user && order.user._id) {
          const user = await User.findById(order.user._id);
          if (user && user.referredBy && !user.referralCodeUsed) {
            try {
              // Get or create reward points record for referral points
              const userId = order.user._id.toString();
              let rewardPoints = await RewardPoints.findOne({ user: userId, isActive: true });
              
              if (!rewardPoints) {
                rewardPoints = new RewardPoints({
                  user: userId,
                  entries: [],
                  totalEarned: 0,
                  totalRedeemed: 0,
                  isActive: true
                });
              }

              // Create referral points entry
              const referralExpiryDate = new Date();
              referralExpiryDate.setMonth(referralExpiryDate.getMonth() + 6);

              const referralEntry = {
                orderId: order._id,
                points: 200, // Fixed 200 points for referral
                orderAmount: order.total,
                expiryDate: referralExpiryDate,
                isActive: true,
                isReferralPoints: true
              };

              rewardPoints.entries.push(referralEntry);
              rewardPoints.totalEarned += 200;
              await rewardPoints.save();

              // Mark referral code as used
              user.referralCodeUsed = true;
              await user.save();

              // Send referral points notification
              try {
                await notificationService.sendReferralPointsNotification(
                  user, 
                  200, 
                  user.referredBy.name || 'Friend', 
                  orderId
                );
                console.log(`Referral points notification sent to user ${order.user._id}`);
              } catch (notificationError) {
                console.error('Error sending referral notification:', notificationError);
              }

              console.log(`Awarded 200 referral points to user ${order.user._id} for first order ${orderId} (referred by ${user.referredBy})`);
            } catch (referralError) {
              console.error('Error awarding referral points:', referralError);
            }
          }
        }
      } catch (rewardError) {
        // Don't fail the order status update if reward points fail, but log the error
        console.error(`❌ Error awarding reward points for order ${orderId}:`, rewardError);
        console.error('Error details:', {
          message: rewardError.message,
          stack: rewardError.stack,
          orderId: orderId,
          userId: order.user?._id,
          orderTotal: order.total
        });
      }
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        order
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Cancel order
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: orderId, user: userId }).populate('user', 'email name');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (['delivered', 'cancelled'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled'
      });
    }

    order.orderStatus = 'cancelled';
    await order.save();

    // Send cancellation notification
    try {
      await notificationService.sendOrderStatusNotifications(order, 'cancelled');
    } catch (notificationError) {
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}; 

// Return order
export const returnOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    const { reason, description } = req.body;

    const order = await Order.findOne({ _id: orderId, user: userId }).populate('user', 'email name');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be returned (only delivered orders can be returned)
    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Update order status to returned
    order.orderStatus = 'returned';
    order.returnReason = reason;
    order.returnDescription = description;
    order.returnDate = new Date();
    await order.save();

    // Send return notification
    try {
      await notificationService.sendOrderStatusNotifications(order, 'returned');
    } catch (notificationError) {
      // Don't fail the return request if notification fails
    }

    res.json({
      success: true,
      message: 'Return request submitted successfully',
      data: {
        order
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}; 