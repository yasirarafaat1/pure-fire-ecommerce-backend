import { Router } from "express";
import {
  createNotification,
  deleteNotification,
  listNotifications,
  updateNotification,
} from "../../controllers/admin/notifications.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("notifications.read"), asyncHandler(listNotifications));
router.post(
  "/",
  requireAdminPermission("notifications.manage"),
  auditAdminAction("NOTIFICATION_CREATED", "NOTIFICATION"),
  asyncHandler(createNotification)
);
router.patch(
  "/:id",
  requireAdminPermission("notifications.manage"),
  auditAdminAction("NOTIFICATION_UPDATED", "NOTIFICATION", (req) => req.params.id),
  asyncHandler(updateNotification)
);
router.delete(
  "/:id",
  requireAdminPermission("notifications.manage"),
  auditAdminAction("NOTIFICATION_DELETED", "NOTIFICATION", (req) => req.params.id),
  asyncHandler(deleteNotification)
);
export default router;
