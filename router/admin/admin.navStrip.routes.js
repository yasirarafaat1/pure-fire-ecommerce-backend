import { Router } from "express";
import {
  createNavStrip,
  deleteNavStrip,
  listNavStripAdmin,
  updateNavStrip,
  updateNavStripSettings,
} from "../../controller/admin/navStrip.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const manage = requireAdminPermission("settings.manage");

router.get("/", manage, asyncHandler(listNavStripAdmin));
router.put("/settings", manage, auditAdminAction("NAV_STRIP_SETTINGS_UPDATED", "NAV_STRIP"), asyncHandler(updateNavStripSettings));
router.post("/", manage, auditAdminAction("NAV_STRIP_CREATED", "NAV_STRIP"), asyncHandler(createNavStrip));
router.patch(
  "/:id",
  manage,
  auditAdminAction("NAV_STRIP_UPDATED", "NAV_STRIP", (req) => req.params.id),
  asyncHandler(updateNavStrip),
);
router.delete(
  "/:id",
  manage,
  auditAdminAction("NAV_STRIP_DELETED", "NAV_STRIP", (req) => req.params.id),
  asyncHandler(deleteNavStrip),
);

export default router;
