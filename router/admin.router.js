import { Router } from "express";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  uploadProduct,
  getProducts,
  updateProduct,
  createDraftProduct,
  updateDraft,
  getDrafts,
  deleteDraft,
  getOrders,
  updateOrderStatus,
  login,
  deleteProduct,
  getCategories,
  getCategoryTree,
  searchProducts,
  topProducts,
  createBanner,
  getBannersAdmin,
  getBannersPublic,
  updateBanner,
  deleteBanner,
} from "../controller/admin.controller.js";
import { upload } from "../middleware/multer.middleware.js";

const router = Router();

// category management
router.post("/add-catagory", createCategory); // legacy alias
router.post("/categories", createCategory);
router.get("/get-categories", getCategories); // legacy alias -> tree
router.get("/categories/tree", getCategoryTree);
router.patch("/categories/:id", renameCategory);
router.delete("/categories/:id", deleteCategory);

// auth
router.post("/login", login);

// products
router.get("/drafts", getDrafts);
router.post(
  "/drafts",
  upload.any(),
  createDraftProduct
);
router.patch(
  "/drafts/:draft_id",
  upload.any(),
  updateDraft
);
router.delete("/drafts/:draft_id", deleteDraft);

router.post(
  "/upload-product",
  upload.any(),
  uploadProduct
);
router.get("/get-products", getProducts);
router.get("/search-products", searchProducts);
router.get("/top-products", topProducts);
router.patch(
  "/update-product/:product_id",
  upload.any(),
  updateProduct
);
router.delete("/delete-product", deleteProduct);
router.post("/delete-product", deleteProduct);

// orders
router.get("/get-orders", getOrders);
router.patch("/update-order-status", updateOrderStatus);

// banners
router.post("/banners", upload.single("image"), createBanner);
router.get("/banners", getBannersAdmin);
router.get("/banners/public", getBannersPublic);
router.patch("/banners/:id", upload.single("image"), updateBanner);
router.delete("/banners/:id", deleteBanner);

export { router };
export default router;
