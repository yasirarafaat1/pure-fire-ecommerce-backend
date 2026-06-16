import { Router } from "express";
import {
  getSettings,
  updateSettings,
} from "../../controllers/admin/settings.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("settings.manage"), asyncHandler(getSettings));
router.put(
  "/",
  requireAdminPermission("settings.manage"),
  auditAdminAction("SETTINGS_UPDATED", "SETTINGS", () => "default"),
  asyncHandler(updateSettings)
);
export default router;
