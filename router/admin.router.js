import { Router } from "express";
import {
  getBannersPublic,
  getCategoryTree,
  getProducts,
  searchProducts,
  topProducts,
} from "../controller/admin.controller.js";
import { getPublicSettings } from "../controllers/admin/settings.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Storefront compatibility reads. Management APIs live under /api/admin.
router.get("/get-categories", asyncHandler(getCategoryTree));
router.get("/categories/tree", asyncHandler(getCategoryTree));
router.get("/get-products", asyncHandler(getProducts));
router.get("/search-products", asyncHandler(searchProducts));
router.get("/top-products", asyncHandler(topProducts));
router.get("/banners/public", asyncHandler(getBannersPublic));
router.get("/settings/public", asyncHandler(getPublicSettings));

export default router;
