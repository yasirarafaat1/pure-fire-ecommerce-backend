import { Router } from "express";
import {
  createAdminUser,
  listAdminUsers,
  resetAdminPassword,
  updateAdminUser,
} from "../../controllers/admin/adminUsers.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const manage = requireAdminPermission("admins.manage");
router.get("/", manage, asyncHandler(listAdminUsers));
router.post("/", manage, auditAdminAction("ADMIN_CREATED", "ADMIN"), asyncHandler(createAdminUser));
router.patch(
  "/:id",
  manage,
  auditAdminAction("ADMIN_UPDATED", "ADMIN", (req) => req.params.id),
  asyncHandler(updateAdminUser)
);
router.post(
  "/:id/reset-password",
  manage,
  auditAdminAction("ADMIN_PASSWORD_RESET", "ADMIN", (req) => req.params.id),
  asyncHandler(resetAdminPassword)
);
export default router;
