import express from 'express';
import { verifyOtp } from '../controllers/admin/verifyOtpControllers.js';
import { createGuest, login } from '../controllers/web/authController.js';
import { register, verifyOtp as webVerifyOtp, setPassword, forgotPassword, resetPassword, getProfile, updateProfile, deleteProfile, sendPhoneOtp, verifyPhoneOtp } from '../controllers/web/authController.js';
import { getBanners, createBanner, getBannerById, updateBanner, deleteBanner } from '../controllers/web/bannerController.js';   
import uploadBanner from '../upload/banner.js';
import uploadCategory from '../upload/category.js';
import { getCategories,createCategory,getCategoryById,updateCategory,deleteCategory } from '../controllers/web/categoryController.js';
import { createProduct, deleteProduct, getProductById, getProducts, getProductsByCategory, updateProduct, getVariantAttributes, updateVariantAttributes, generateVariantCombinations, bulkUpdateVariants, validateSKU, getProductAlerts, getProductStats, bulkUpdateProducts } from '../controllers/web/productController.js';
import uploadProduct from '../upload/product.js';
import { createSubcategory, getSubcategories, getSubcategoryById, updateSubcategory, deleteSubcategory } from '../controllers/web/subcategoryController.js';
import uploadSubcategory from '../upload/subcategory.js';
import { addReview, getProductReviews, updateReview, deleteReview, markReviewHelpful, getUserReview } from '../controllers/web/reviewController.js';
import uploadReview from '../upload/review.js';
import { createCoupon, getCoupons, getCouponById, updateCoupon, deleteCoupon, validateCoupon } from '../controllers/web/couponController.js';
import { getCart, addToCart, removeFromCart, updateCartItem, clearCart, saveForLater, moveToCart, removeFromSaved, mergeCart, getGuestCart, addToGuestCart, applyCoupon, removeCoupon, applyPromoCode, removePromoCode, applyGiftVoucher, removeGiftVoucher } from '../controllers/web/cartController.js';
import { addAddress, getAddresses, updateAddress, deleteAddress, setDefaultAddress } from '../controllers/web/addressController.js';
import { getPaymentMethods, getPaymentMethodById, createRazorpayOrder, verifyRazorpayPayment } from '../controllers/web/paymentMethodController.js';
import { getEMIPlans, validateEMIEligibility, processEMIPayment, getEMITransactions } from '../controllers/web/emiController.js';
import { createOrder, getUserOrders, getOrderById, updateOrderStatus, cancelOrder, returnOrder, createPreOrder } from '../controllers/web/orderController.js';
import { createRating, getOrderRating, getUserRatings, updateRating, deleteRating, getProductOrderReviews } from '../controllers/web/ratingController.js';
import { getUserRewardPoints, addRewardPoints, redeemRewardPoints, getRewardPointsHistory } from '../controllers/web/rewardPointsController.js';
import { getUserReferralCode, validateReferralCode, awardReferralPoints, getReferralStats } from '../controllers/web/referralController.js';
import { getUserProfile, updateUserProfile, changePassword, deleteUserAccount, getUserStats } from '../controllers/web/profileController.js';
import { getWishlist, addToWishlist, removeFromWishlist, checkWishlistStatus } from '../controllers/web/wishlistController.js';
import { getActivePromoCodes, getActiveGiftVouchers, getDigitalWallets, getBankOffers } from '../controllers/web/promoGiftController.js';
import { getAllPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod, togglePaymentMethodStatus, reorderPaymentMethods, saveRazorpayConfig, saveWebhookConfig, deleteWebhookConfig, deleteRazorpayConfig } from '../controllers/admin/paymentMethodController.js';
import { getNotificationLogs, getNotificationStats, resendNotification, getOrderNotificationLogs } from '../controllers/admin/notificationController.js';
import { getCustomerDetails, getCustomerOrders, getCustomerRewardPoints, getAllCustomers, updateCustomer, deleteCustomer, exportCustomers, getCustomerStats } from '../controllers/admin/customerController.js';
import { getAllOrders, getOrderDetails, updateOrderStatus as updateAdminOrderStatus, getOrderStats, updateOrder, deleteOrder, exportOrders, bulkUpdateOrders, processRefund, generateInvoice, createShipment } from '../controllers/admin/orderController.js';
import { getAllTransactions, getTransactionDetails, getTransactionStats, exportTransactions, syncTransactions } from '../controllers/admin/transactionController.js';
import { bulkImportProducts, getImportTemplate, getCategoriesForImport, exportProducts, getProductCount } from '../controllers/admin/bulkImportController.js';
import { 
  checkStockLevels, 
  getLowStockProducts, 
  updateStockAlertSettings, 
  bulkUpdateStockAlertSettings, 
  getStockAlertStats, 
  controlStockMonitoring,
  debugAllProducts,
  resetStockAlertTimestamps,
  controlDailyCronJob
} from '../controllers/admin/stockAlertController.js';
import { calculateShippingCharges, getTrackingDetails, createShipment as createWebShipment, updateShipmentStatus, processWebhook, getDeliveryAnalytics, getActiveDeliveries, addDeliveryNote, getDeliveryTimeline, assignDeliveryBoy, markAsDelivered, getDeliveryBoyDashboard, processDeliveryPartnerWebhook, syncOrderToIThinkLogistics, callIThinkRateCheck, callIThinkAddJson, getIThinkLogisticsTracking, handleIThinkLogisticsWebhook, checkPincodeAvailability, cancelOrderWithIThinkLogistics, trackOrderWithIThinkLogistics, autoTrackOrders } from '../controllers/web/logisticsController.js';
import { checkStockAfterUpdate, checkStockAfterOrder } from '../middleware/stockAlertMiddleware.js';
import { 
  getLogisticsStats,
  getDeliveries,
  getDeliveryDetails,
  createShipment as createAdminShipment,
  updateShipmentStatus as updateAdminShipmentStatus,
  addDeliveryNote as addAdminDeliveryNote,
  getDeliveryTimeline as getAdminDeliveryTimeline,
  getActiveDeliveries as getAdminActiveDeliveries,
  exportDeliveries,
  assignDeliveryBoy as assignAdminDeliveryBoy,
  markAsDelivered as markAdminAsDelivered,
  getDeliveryBoyDashboard as getAdminDeliveryBoyDashboard,
  getDeliveryBoys,
  bulkUpdateDeliveryStatuses,
  getOrderLogisticsMapping
} from '../controllers/admin/logisticsController.js';
import {
  getDashboardStats,
  getRecentOrders,
  getTopProducts,
  getSalesChartData,
  getPerformanceMetrics,
  getInventoryStatus,
  getActiveUsersData
} from '../controllers/admin/dashboardController.js';
import {
  getSettings,
  updateSettings,
  getSettingCategory,
  updateSettingCategory,
  resetSettings
} from '../controllers/admin/settingsController.js';
import {
  getCouponAnalytics,
  getCouponDetails
} from '../controllers/admin/couponAnalyticsController.js';
import {
  getRewardManagementAnalytics,
  getUserRewardDetails
} from '../controllers/admin/rewardManagementController.js';
import {
  getAllPromos,
  createPromo,
  updatePromo,
  deletePromo,
  getPromoAnalytics,
  getPromosWithStats
} from '../controllers/admin/promoManagementController.js';
import {
  getAllGiftVouchers,
  createGiftVoucher,
  updateGiftVoucher,
  deleteGiftVoucher,
  getGiftVoucherAnalytics,
  getGiftVouchersWithStats
} from '../controllers/admin/giftVoucherManagementController.js';
import {
  getAllWarranties,
  getWarrantyById,
  createWarranty,
  updateWarranty,
  deleteWarranty,
  getWarrantiesWithStats
} from '../controllers/admin/warrantyController.js';
import {
  getWarrantyStats,
  getUserWarranties,
  getProductWarranties,
  getWarrantyAnalytics
} from '../controllers/admin/warrantyManagementController.js';
import {
  getAllSelfLogistics,
  getSelfLogisticsById,
  createSelfLogistics,
  updateSelfLogistics,
  deleteSelfLogistics
} from '../controllers/admin/selfLogisticsController.js';
import uploadCoupon from '../upload/coupon.js';
import verifyToken from '../middleware/auth.js';
import { postAdmin, postForgot } from '../controllers/admin/authControllers.js';
import { createEnquiry, getUserEnquiries, getFAQQuestions } from '../controllers/web/enquiryController.js';
import { getAllEnquiries, getEnquiryById, updateEnquiryStatus, replyToEnquiry, deleteEnquiry, getEnquiryStats, bulkUpdateEnquiries } from '../controllers/admin/enquiryController.js';
import { getAllFAQs, getFAQById, createFAQ, updateFAQ, deleteFAQ, toggleFAQStatus, reorderFAQs, getFAQStats, bulkDeleteFAQs, bulkUpdateFAQStatus } from '../controllers/admin/faqController.js';
import { createPreOrderNotification, getUserPreOrderNotifications, removePreOrderNotification } from '../controllers/web/preOrderController.js';
import { getProductWarranties as getWebProductWarranties, getWarrantiesForProducts, getUserWarranties as getWebUserWarranties } from '../controllers/web/warrantyController.js';

// if using image upload

export const router = express.Router();



/* auth API endpoints */

router.route('/admin/login').post(postAdmin);
router.route('/admin/forgot-password').post(postForgot);
router.route('/admin/verify-otp').post(verifyOtp);
// Web frontend auth endpoints
router.route('/web/guest').post(createGuest);
router.route('/web/login').post(login);
router.route('/web/register').post(register);
router.route('/web/verify-otp').post(webVerifyOtp);
router.route('/web/set-password').post(setPassword);
router.route('/web/forgot-password').post(forgotPassword);
router.route('/web/reset-password').post(resetPassword);
router.route('/web/send-phone-otp').post(verifyToken, sendPhoneOtp);
router.route('/web/verify-phone-otp').post(verifyToken, verifyPhoneOtp);

// Web Address endpoints
router.route('/web/address').post(verifyToken, addAddress).get(verifyToken, getAddresses);
router.route('/web/address/:id').put(verifyToken, updateAddress).delete(verifyToken, deleteAddress);
router.route('/web/address/:id/default').patch(verifyToken, setDefaultAddress);

// Web banners endpoints
router.route('/web/banners').get(getBanners).post(uploadBanner, createBanner);
router.route('/web/banners/:id').get(getBannerById).put(uploadBanner, updateBanner).delete(deleteBanner);
// Web categories endpoints
router.route('/web/categories').get(getCategories).post(uploadCategory, createCategory);
router.route('/web/categories/:id').get(getCategoryById).put(uploadCategory, updateCategory).delete(deleteCategory);
// Web products endpoints
router.route('/web/products').get(getProducts).post(uploadProduct, createProduct);
router.route('/web/products/:id').get(getProductById).put(uploadProduct, checkStockAfterUpdate, updateProduct).delete(deleteProduct);
router.route('/web/products-by-category').get(getProductsByCategory);

// Dynamic Variant Management Routes
router.route('/web/products/:productId/variant-attributes').get(getVariantAttributes);
router.route('/web/products/:productId/variant-attributes').put(updateVariantAttributes);
router.route('/web/products/:productId/generate-combinations').post(generateVariantCombinations);
router.route('/web/products/:productId/bulk-update-variants').put(bulkUpdateVariants);

// Product Management & Alerts Routes
router.route('/web/products/validate-sku').post(validateSKU);
router.route('/web/products/alerts').get(getProductAlerts);
router.route('/web/products/stats').get(getProductStats);
router.route('/web/products/bulk-update').put(checkStockAfterUpdate, bulkUpdateProducts);


router.route('/web/subcategories').get(getSubcategories).post(uploadSubcategory, createSubcategory);
router.route('/web/subcategories/:id').get(getSubcategoryById).put(uploadSubcategory, updateSubcategory).delete(deleteSubcategory);

// Web review endpoints
router.route('/web/products/:productId/reviews').get(getProductReviews).post(verifyToken, uploadReview, addReview);
router.route('/web/products/:productId/reviews/:reviewId').put(verifyToken, uploadReview, updateReview).delete(verifyToken, deleteReview);
router.route('/web/products/:productId/reviews/:reviewId/helpful').post(verifyToken, markReviewHelpful);
router.route('/web/products/:productId/my-review').get(verifyToken, getUserReview);

// Web coupons endpoints
router.route('/web/coupons').get(getCoupons).post(uploadCoupon, createCoupon);
router.route('/web/coupons/:id').get(getCouponById).put(uploadCoupon, updateCoupon).delete(deleteCoupon);
router.route('/web/coupons/validate').post(validateCoupon);

// Cart endpoints
router.route('/web/cart').get(verifyToken, getCart);
router.route('/web/cart/add').post(verifyToken, addToCart);
router.route('/web/cart/remove/:itemId').delete(verifyToken, removeFromCart);
router.route('/web/cart/update/:productId').put(verifyToken, updateCartItem);
router.route('/web/cart/clear').post(verifyToken, clearCart);
router.route('/web/cart/save-for-later/:itemId').post(verifyToken, saveForLater);
router.route('/web/cart/move-to-cart/:itemId').post(verifyToken, moveToCart);
router.route('/web/cart/remove-from-saved/:itemId').delete(verifyToken, removeFromSaved);
router.route('/web/cart/merge').post(verifyToken, mergeCart);
router.route('/web/cart/apply-coupon').post(verifyToken, applyCoupon);
router.route('/web/cart/remove-coupon').post(verifyToken, removeCoupon);
router.route('/web/cart/apply-promo').post(verifyToken, applyPromoCode);
router.route('/web/cart/remove-promo').post(verifyToken, removePromoCode);
router.route('/web/cart/apply-gift-voucher').post(verifyToken, applyGiftVoucher);
router.route('/web/cart/remove-gift-voucher').post(verifyToken, removeGiftVoucher);

// Guest cart endpoints
router.route('/web/cart/guest/:guestId').get(getGuestCart);
router.route('/web/cart/guest/add').post(addToGuestCart);

// Profile endpoints
router.route('/auth/profile').get(verifyToken, getProfile).put(verifyToken, updateProfile).delete(verifyToken, deleteProfile);

// Web Payment endpoints
router.route('/web/payment-methods').get(getPaymentMethods);
router.route('/web/payment-methods/:id').get(getPaymentMethodById);
router.route('/web/razorpay/create-order').post(verifyToken, createRazorpayOrder);
router.route('/web/razorpay/verify').post(verifyToken, verifyRazorpayPayment);

// Web EMI endpoints
router.route('/web/emi/plans').get(getEMIPlans);
router.route('/web/emi/validate').post(verifyToken, validateEMIEligibility);
router.route('/web/emi/process').post(verifyToken, processEMIPayment);
router.route('/web/emi/transactions').get(verifyToken, getEMITransactions);

// Web Order endpoints
router.route('/web/orders').get(verifyToken, getUserOrders).post(verifyToken, checkStockAfterOrder, createOrder);
router.route('/web/orders/pre-order').post(createPreOrder); // No auth required - can be guest
router.route('/web/orders/:orderId').get(verifyToken, getOrderById);
router.route('/web/orders/:orderId/status').put(verifyToken, updateOrderStatus);
router.route('/web/orders/:orderId/cancel').post(verifyToken, cancelOrder);
router.route('/web/orders/:orderId/return').post(verifyToken, returnOrder);

// Web Rating endpoints
router.route('/web/orders/:orderId/rating').get(verifyToken, getOrderRating).post(verifyToken, uploadReview, createRating);
router.route('/web/ratings').get(verifyToken, getUserRatings);
router.route('/web/ratings/:ratingId').put(verifyToken, updateRating).delete(verifyToken, deleteRating);
router.route('/web/products/:productId/order-reviews').get(getProductOrderReviews);

// Web Reward Points endpoints
router.route('/web/reward-points').get(verifyToken, getUserRewardPoints);
router.route('/web/reward-points/add').post(verifyToken, addRewardPoints);
router.route('/web/reward-points/redeem').post(verifyToken, redeemRewardPoints);
router.route('/web/reward-points/history').get(verifyToken, getRewardPointsHistory);

// Web Referral endpoints
router.route('/web/referral/code').get(verifyToken, getUserReferralCode);
router.route('/web/referral/validate').post(validateReferralCode);
router.route('/web/referral/award').post(verifyToken, awardReferralPoints);
router.route('/web/referral/stats').get(verifyToken, getReferralStats);

// Web Profile endpoints
router.route('/web/profile').get(verifyToken, getUserProfile).put(verifyToken, updateUserProfile);
router.route('/web/profile/change-password').post(verifyToken, changePassword);
router.route('/web/profile/delete').post(verifyToken, deleteUserAccount);
router.route('/web/profile/stats').get(verifyToken, getUserStats);

// Web Wishlist endpoints
router.route('/web/wishlist').get(verifyToken, getWishlist);
router.route('/web/wishlist/add').post(verifyToken, addToWishlist);
router.route('/web/wishlist/remove/:productId').delete(verifyToken, removeFromWishlist);
router.route('/web/wishlist/check/:productId').get(verifyToken, checkWishlistStatus);

// Web Promo Code, Gift Voucher, Digital Wallets, and Bank Offers endpoints (public - no auth required)
router.route('/web/promo-codes').get(getActivePromoCodes);
router.route('/web/gift-vouchers').get(getActiveGiftVouchers);
router.route('/web/digital-wallets').get(getDigitalWallets);
router.route('/web/bank-offers').get(getBankOffers);

// Web Logistics endpoints
router.route('/web/logistics/shipping-charges').post(verifyToken, calculateShippingCharges);
router.route('/web/logistics/check-pincode/:pincode').get(checkPincodeAvailability);
router.route('/web/logistics/tracking/:trackingNumber').get(getTrackingDetails);
router.route('/web/logistics/shipment').post(verifyToken, createWebShipment);
router.route('/web/logistics/shipment/:trackingNumber/status').put(verifyToken, updateShipmentStatus);
router.route('/web/logistics/shipment/:trackingNumber/note').post(verifyToken, addDeliveryNote);
router.route('/web/logistics/shipment/:trackingNumber/timeline').get(getDeliveryTimeline);
router.route('/web/logistics/shipment/:trackingNumber/assign-delivery-boy').post(verifyToken, assignDeliveryBoy);
router.route('/web/logistics/shipment/:trackingNumber/mark-delivered').post(verifyToken, markAsDelivered);
router.route('/web/logistics/delivery-boy/:deliveryBoyId/dashboard').get(verifyToken, getDeliveryBoyDashboard);
router.route('/web/logistics/webhook/:partnerCode').post(processWebhook);
router.route('/web/logistics/webhook/delivery-partner/:partnerCode').post(processDeliveryPartnerWebhook);
router.route('/web/logistics/sync-ithink').post(verifyToken, syncOrderToIThinkLogistics);
router.route('/web/logistics/cancel-ithink').post(verifyToken, cancelOrderWithIThinkLogistics);
router.route('/web/logistics/track-ithink').post(verifyToken, trackOrderWithIThinkLogistics);
router.route('/web/logistics/auto-track').post(verifyToken, autoTrackOrders);
router.route('/web/logistics/rate-check').post(verifyToken, callIThinkRateCheck);
router.route('/web/logistics/add-json').post(verifyToken, callIThinkAddJson);
router.route('/web/logistics/ithink-tracking/:awbNumber').get(verifyToken, getIThinkLogisticsTracking);
router.route('/web/logistics/ithink-webhook').post(handleIThinkLogisticsWebhook);
router.route('/web/logistics/analytics').get(verifyToken, getDeliveryAnalytics);
router.route('/web/logistics/active-deliveries').get(verifyToken, getActiveDeliveries);

// Admin Payment Method endpoints
router.route('/admin/payment-methods').get(verifyToken, getAllPaymentMethods).post(verifyToken, createPaymentMethod);
router.route('/admin/payment-methods/:id').put(verifyToken, updatePaymentMethod).delete(verifyToken, deletePaymentMethod);
router.route('/admin/payment-methods/:id/toggle').patch(verifyToken, togglePaymentMethodStatus);
router.route('/admin/payment-methods/reorder').post(verifyToken, reorderPaymentMethods);

// Admin Payment Configuration endpoints
router.route('/admin/payments/config/razorpay').post(verifyToken, saveRazorpayConfig).delete(verifyToken, deleteRazorpayConfig);
router.route('/admin/payments/config/webhook').post(verifyToken, saveWebhookConfig).delete(verifyToken, deleteWebhookConfig);

// Admin Notification endpoints
router.route('/admin/notifications/logs').get(verifyToken, getNotificationLogs);
router.route('/admin/notifications/stats').get(verifyToken, getNotificationStats);
router.route('/admin/notifications/:logId/resend').post(verifyToken, resendNotification);
router.route('/admin/orders/:orderId/notifications').get(verifyToken, getOrderNotificationLogs);


// Admin Customer endpoints
router.route('/admin/customers').get(verifyToken, getAllCustomers);
router.route('/admin/customers/:customerId').get(verifyToken, getCustomerDetails);
router.route('/admin/customers/:customerId').put(verifyToken, updateCustomer);
router.route('/admin/customers/:customerId').delete(verifyToken, deleteCustomer);
router.route('/admin/customers/:customerId/orders').get(verifyToken, getCustomerOrders);
router.route('/admin/customers/:customerId/reward-points').get(verifyToken, getCustomerRewardPoints);
router.route('/admin/customers/export').get(verifyToken, exportCustomers);
router.route('/admin/customers/stats').get(verifyToken, getCustomerStats);

// Admin Order endpoints
router.route('/admin/orders').get(verifyToken, getAllOrders);
router.route('/admin/orders/stats').get(verifyToken, getOrderStats);
router.route('/admin/orders/:orderId').get(verifyToken, getOrderDetails);
router.route('/admin/orders/:orderId/status').put(verifyToken, updateAdminOrderStatus);
router.route('/admin/orders/:orderId/update').put(verifyToken, updateOrder);
router.route('/admin/orders/:orderId/delete').delete(verifyToken, deleteOrder);
router.route('/admin/orders/export').get(verifyToken, exportOrders);
router.route('/admin/orders/bulk-update').put(verifyToken, bulkUpdateOrders);
router.route('/admin/orders/:orderId/refund').post(verifyToken, processRefund);
router.route('/admin/orders/:orderId/invoice').get(verifyToken, generateInvoice);
router.route('/admin/orders/create-shipment').post(verifyToken, createShipment);

// Admin Transaction endpoints
router.route('/admin/transactions').get(verifyToken, getAllTransactions);
router.route('/admin/transactions/stats').get(verifyToken, getTransactionStats);
router.route('/admin/transactions/sync').post(verifyToken, syncTransactions);
router.route('/admin/transactions/:transactionId').get(verifyToken, getTransactionDetails);
router.route('/admin/transactions/export').get(verifyToken, exportTransactions);

// Admin Bulk Import endpoints
router.route('/admin/products/bulk-import').post(verifyToken, bulkImportProducts);
router.route('/admin/products/import-template').get(verifyToken, getImportTemplate);
router.route('/admin/products/categories-for-import').get(verifyToken, getCategoriesForImport);
router.route('/admin/products/export').get(verifyToken, exportProducts);
router.route('/admin/products/count').get(verifyToken, getProductCount);
router.route('/admin/categories').get(verifyToken, getCategories);


// Admin Stock Alert endpoints
router.route('/admin/stock-alerts/check').post(verifyToken, checkStockLevels);
router.route('/admin/stock-alerts/low-stock').get(verifyToken, getLowStockProducts);
router.route('/admin/stock-alerts/stats').get(verifyToken, getStockAlertStats);
router.route('/admin/stock-alerts/settings/:productId').put(verifyToken, updateStockAlertSettings);
router.route('/admin/stock-alerts/settings/bulk').put(verifyToken, bulkUpdateStockAlertSettings);
router.route('/admin/stock-alerts/monitoring').post(verifyToken, controlStockMonitoring);
router.route('/admin/stock-alerts/debug').get(verifyToken, debugAllProducts);
router.route('/admin/stock-alerts/reset-timestamps/:productId?').post(verifyToken, resetStockAlertTimestamps);

// Admin Daily Cron Job endpoints
router.route('/admin/stock-alerts/daily-cron').post(verifyToken, controlDailyCronJob);

// Admin Logistics endpoints
router.route('/admin/logistics/stats').get(verifyToken, getLogisticsStats);
router.route('/admin/logistics/deliveries').get(verifyToken, getDeliveries);
router.route('/admin/logistics/deliveries/export').get(verifyToken, exportDeliveries);
router.route('/admin/logistics/deliveries/bulk-update').put(verifyToken, bulkUpdateDeliveryStatuses);
router.route('/admin/logistics/deliveries/:trackingNumber').get(verifyToken, getDeliveryDetails);
router.route('/admin/logistics/shipment').post(verifyToken, createAdminShipment);
router.route('/admin/logistics/shipment/:trackingNumber/status').put(verifyToken, updateAdminShipmentStatus);
router.route('/admin/logistics/shipment/:trackingNumber/note').post(verifyToken, addAdminDeliveryNote);
router.route('/admin/logistics/shipment/:trackingNumber/timeline').get(verifyToken, getAdminDeliveryTimeline);
router.route('/admin/logistics/shipment/:trackingNumber/assign-delivery-boy').post(verifyToken, assignAdminDeliveryBoy);
router.route('/admin/logistics/shipment/:trackingNumber/mark-delivered').post(verifyToken, markAdminAsDelivered);
router.route('/admin/logistics/delivery-boys').get(verifyToken, getDeliveryBoys);
router.route('/admin/logistics/delivery-boy/:deliveryBoyId/dashboard').get(verifyToken, getAdminDeliveryBoyDashboard);
router.route('/admin/logistics/active-deliveries').get(verifyToken, getAdminActiveDeliveries);
router.route('/admin/logistics/order-mappings').get(verifyToken, getOrderLogisticsMapping);

// Admin Dashboard endpoints
router.route('/admin/dashboard/stats').get(verifyToken, getDashboardStats);
router.route('/admin/dashboard/recent-orders').get(verifyToken, getRecentOrders);
router.route('/admin/dashboard/top-products').get(verifyToken, getTopProducts);
router.route('/admin/dashboard/sales-chart').get(verifyToken, getSalesChartData);
router.route('/admin/dashboard/performance').get(verifyToken, getPerformanceMetrics);
router.route('/admin/dashboard/inventory-status').get(verifyToken, getInventoryStatus);
router.route('/admin/dashboard/active-users').get(verifyToken, getActiveUsersData);

// Admin Settings endpoints
router.route('/admin/settings').get(verifyToken, getSettings);
router.route('/admin/settings').put(verifyToken, updateSettings);
router.route('/admin/settings/reset').post(verifyToken, resetSettings);
router.route('/admin/settings/:category').get(verifyToken, getSettingCategory);
router.route('/admin/settings/:category').put(verifyToken, updateSettingCategory);

// Admin Coupon Analytics endpoints
router.route('/admin/coupons/analytics').get(verifyToken, getCouponAnalytics);
router.route('/admin/coupons/:couponCode').get(verifyToken, getCouponDetails);

// Admin Reward Management endpoints
router.route('/admin/rewards/analytics').get(verifyToken, getRewardManagementAnalytics);
router.route('/admin/rewards/user/:userId').get(verifyToken, getUserRewardDetails);

// Admin Promo Management endpoints
router.route('/admin/promos').get(verifyToken, getAllPromos);
router.route('/admin/promos').post(verifyToken, createPromo);
router.route('/admin/promos/stats').get(verifyToken, getPromosWithStats);
router.route('/admin/promos/:id').put(verifyToken, updatePromo);
router.route('/admin/promos/:id').delete(verifyToken, deletePromo);
router.route('/admin/promos/:promoId/analytics').get(verifyToken, getPromoAnalytics);

// Admin Gift Voucher Management endpoints
router.route('/admin/gift-vouchers').get(verifyToken, getAllGiftVouchers);
router.route('/admin/gift-vouchers').post(verifyToken, createGiftVoucher);
router.route('/admin/gift-vouchers/stats').get(verifyToken, getGiftVouchersWithStats);
router.route('/admin/gift-vouchers/:id').put(verifyToken, updateGiftVoucher);
router.route('/admin/gift-vouchers/:id').delete(verifyToken, deleteGiftVoucher);
router.route('/admin/gift-vouchers/:giftVoucherId/analytics').get(verifyToken, getGiftVoucherAnalytics);

// Admin Warranty Management endpoints
router.route('/admin/warranty').get(verifyToken, getAllWarranties);
router.route('/admin/warranty').post(verifyToken, createWarranty);
router.route('/admin/warranty/stats').get(verifyToken, getWarrantiesWithStats);
router.route('/admin/warranty/:id').get(verifyToken, getWarrantyById);
router.route('/admin/warranty/:id').put(verifyToken, updateWarranty);
router.route('/admin/warranty/:id').delete(verifyToken, deleteWarranty);
router.route('/admin/warranty/management/stats').get(verifyToken, getWarrantyStats);
router.route('/admin/warranty/management/users').get(verifyToken, getUserWarranties);
router.route('/admin/warranty/management/products').get(verifyToken, getProductWarranties);
router.route('/admin/warranty/:warrantyId/analytics').get(verifyToken, getWarrantyAnalytics);

// Self Logistics routes
router.route('/admin/self-logistics').get(verifyToken, getAllSelfLogistics).post(verifyToken, createSelfLogistics);
router.route('/admin/self-logistics/:id').get(verifyToken, getSelfLogisticsById).put(verifyToken, updateSelfLogistics).delete(verifyToken, deleteSelfLogistics);

// Web Enquiry endpoints (for frontend contact/chat)
router.route('/web/enquiries').post(createEnquiry);
router.route('/web/enquiries/faq').get(getFAQQuestions);
router.route('/web/enquiries/my-enquiries').get(verifyToken, getUserEnquiries);

// Web Warranty endpoints (for frontend)
router.route('/web/warranty/product/:productId').get(getWebProductWarranties);
router.route('/web/warranty/products').post(getWarrantiesForProducts);
router.route('/web/warranty/user').get(verifyToken, getWebUserWarranties);

// Admin FAQ Management endpoints
router.route('/admin/faqs').get(verifyToken, getAllFAQs).post(verifyToken, createFAQ);
router.route('/admin/faqs/stats').get(verifyToken, getFAQStats);
router.route('/admin/faqs/reorder').put(verifyToken, reorderFAQs);
router.route('/admin/faqs/bulk-delete').delete(verifyToken, bulkDeleteFAQs);
router.route('/admin/faqs/bulk-update-status').put(verifyToken, bulkUpdateFAQStatus);
router.route('/admin/faqs/:id').get(verifyToken, getFAQById).put(verifyToken, updateFAQ).delete(verifyToken, deleteFAQ);
router.route('/admin/faqs/:id/toggle-status').patch(verifyToken, toggleFAQStatus);

// Admin Enquiry Management endpoints
router.route('/admin/enquiries').get(verifyToken, getAllEnquiries);
router.route('/admin/enquiries/stats').get(verifyToken, getEnquiryStats);
router.route('/admin/enquiries/bulk-update').put(verifyToken, bulkUpdateEnquiries);
router.route('/admin/enquiries/:id').get(verifyToken, getEnquiryById).delete(verifyToken, deleteEnquiry);
router.route('/admin/enquiries/:id/status').put(verifyToken, updateEnquiryStatus);
router.route('/admin/enquiries/:id/reply').post(verifyToken, replyToEnquiry);

// Web Pre-Order Notification endpoints
router.route('/web/pre-order/notify').post(createPreOrderNotification);
router.route('/web/pre-order/notifications').get(verifyToken, getUserPreOrderNotifications);
router.route('/web/pre-order/notifications/:notificationId').delete(verifyToken, removePreOrderNotification);
