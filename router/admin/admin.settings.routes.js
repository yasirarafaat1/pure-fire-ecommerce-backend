import { Router } from "express";
import {
  getSettings,
  syncInstagram,
  testInstagram,
  updateSettings,
  uploadLogo,
} from "../../controllers/admin/settings.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { logoUpload } from "../../middleware/multer.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("settings.manage"), asyncHandler(getSettings));
router.post(
  "/logo",
  requireAdminPermission("settings.manage"),
  logoUpload.single("logo"),
  asyncHandler(uploadLogo)
);
router.post("/instagram/test", requireAdminPermission("settings.manage"), asyncHandler(testInstagram));
router.post("/instagram/sync", requireAdminPermission("settings.manage"), asyncHandler(syncInstagram));
router.put(
  "/",
  requireAdminPermission("settings.manage"),
  auditAdminAction("SETTINGS_UPDATED", "SETTINGS", () => "default"),
  asyncHandler(updateSettings)
);
export default router;
