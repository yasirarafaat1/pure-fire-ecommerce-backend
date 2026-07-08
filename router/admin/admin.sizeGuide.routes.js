import { Router } from "express";
import {
  getSizeGuideAdmin,
  updateSizeGuideAdmin,
} from "../../controller/admin/sizeGuide.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const manage = requireAdminPermission("settings.manage");

router.get("/", manage, asyncHandler(getSizeGuideAdmin));
router.put("/", manage, auditAdminAction("SIZE_GUIDE_UPDATED", "SIZE_GUIDE"), asyncHandler(updateSizeGuideAdmin));

export default router;
