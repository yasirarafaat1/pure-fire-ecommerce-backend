import { Router } from "express";
import {
  createBanner,
  deleteBanner,
  getBannersAdmin,
  updateBanner,
} from "../../controller/admin.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { imageUpload } from "../../middleware/multer.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const manage = requireAdminPermission("banners.manage");
router.get("/", manage, asyncHandler(getBannersAdmin));
router.post(
  "/",
  manage,
  imageUpload.single("image"),
  auditAdminAction("BANNER_CREATED", "BANNER"),
  asyncHandler(createBanner)
);
router.patch(
  "/:id",
  manage,
  imageUpload.single("image"),
  auditAdminAction("BANNER_UPDATED", "BANNER", (req) => req.params.id),
  asyncHandler(updateBanner)
);
router.delete(
  "/:id",
  manage,
  auditAdminAction("BANNER_DELETED", "BANNER", (req) => req.params.id),
  asyncHandler(deleteBanner)
);
export default router;
