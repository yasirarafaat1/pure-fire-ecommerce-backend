import { Router } from "express";
import {
  showProducts,
  getProductById,
  getProductByCategory,
  searchProducts,
  getTopProducts,
  getCategories,
  getProductReviews,
  listPublicReviews,
  addProductReview,
  getInstagramReels,
  listWishlist,
  addToWishlistDb,
  removeFromWishlistDb,
  clearWishlistDb,
  getUserCart,
  saveUserCart,
  getUserAddresses,
  createNewAddress,
  addToCart,
  removeCartByProduct,
  updateCartItem,
  clearCart,
  updateUserAddress,
  getUserProfile,
  updateUserProfile,
  getUserOrders,
  downloadOrderInvoice,
  createOrder,
  confirmPayment,
  cancelOrder,
  requestReturn,
  lookupPincode,
  estimateDelivery,
} from "../controller/user.controller.js";
import { addRecentSearch, addRecentViewed, getSuggestedProducts } from "../controller/activity.controller.js";
import { getPublicNavStrip, getPublicSizeGuide } from "../controller/user/siteContent.controller.js";
import { upload } from "../middleware/multer.middleware.js";
import { requireUserAuth } from "../middleware/userAuth.middleware.js";
import { detectAssistantAuth } from "../middleware/assistantOptionalAuth.middleware.js";
import { assistantRateLimit } from "../middleware/assistantRateLimit.middleware.js";
import {
  assistantFeedback,
  assistantHistory,
  assistantSessions,
  assistantOrderLookup,
  createAssistantSession,
  sendAssistantMessage,
} from "../controller/user/assistant.controller.js";

const router = Router();

router.get("/show-product", showProducts);
router.get("/get-product-byid/:id", getProductById);
router.get("/get-product-byCategory/:category", getProductByCategory);
router.get("/search", searchProducts);
router.post("/search", searchProducts);
router.get("/top-products", getTopProducts);
router.get("/get-categories", getCategories);
router.get("/reviews", listPublicReviews);
router.get("/instagram/reels", getInstagramReels);
router.get("/nav-strip", getPublicNavStrip);
router.get("/size-guide", getPublicSizeGuide);
router.get("/get-product-reviews/:id", getProductReviews);
router.post("/product-reviews", upload.single("reviewImage"), addProductReview);
router.post("/wishlist/list", requireUserAuth, listWishlist);
router.post("/wishlist/add", requireUserAuth, addToWishlistDb);
router.post("/wishlist/remove", requireUserAuth, removeFromWishlistDb);
router.post("/wishlist/clear", requireUserAuth, clearWishlistDb);
router.post("/get-user-cart", getUserCart);
router.post("/save-cart", saveUserCart);
router.post("/add-to-cart", addToCart);
router.get("/remove-cart-by-product/:productId", removeCartByProduct);
router.post("/update-cart-item", updateCartItem);
router.post("/clear-cart", clearCart);
router.post("/get-user-addresess", requireUserAuth, getUserAddresses);
router.post("/create-newAddress", requireUserAuth, createNewAddress);
router.patch("/update-user-address", requireUserAuth, updateUserAddress);
router.post("/get-user-profile", requireUserAuth, getUserProfile);
router.post("/update-user-profile", requireUserAuth, updateUserProfile);
router.post("/get-orders", getUserOrders);
router.get("/orders/:orderId/invoice/download", requireUserAuth, downloadOrderInvoice);
router.post("/create-order", createOrder);
router.post("/payment-success", confirmPayment);
router.post("/cancel-order", cancelOrder);
router.post("/return-order", requireUserAuth, requestReturn);
router.get("/pincode/:pin", lookupPincode);
router.get("/delivery-estimate", estimateDelivery);
router.post("/activity/search", requireUserAuth, addRecentSearch);
router.post("/activity/view", requireUserAuth, addRecentViewed);
router.get("/suggested-products", requireUserAuth, getSuggestedProducts);
router.post("/assistant/session", detectAssistantAuth, createAssistantSession);
router.post("/assistant/message", detectAssistantAuth, assistantRateLimit, sendAssistantMessage);
router.post("/assistant/order-lookup", detectAssistantAuth, assistantRateLimit, assistantOrderLookup);
router.post("/assistant/feedback", detectAssistantAuth, assistantFeedback);
router.get("/assistant/sessions", detectAssistantAuth, assistantSessions);
router.get("/assistant/history", detectAssistantAuth, assistantHistory);

export { router };
export default router;
