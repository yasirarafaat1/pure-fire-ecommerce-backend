import { Router } from "express";
import {
  deleteReview,
  listReviews,
  moderateReview,
} from "../../controllers/admin/reviews.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("reviews.read"), asyncHandler(listReviews));
router.patch("/:id/status", requireAdminPermission("reviews.manage"), asyncHandler(moderateReview));
router.delete("/:id", requireAdminPermission("reviews.manage"), asyncHandler(deleteReview));
export default router;
