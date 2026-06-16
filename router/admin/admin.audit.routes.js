import { Router } from "express";
import { listAuditLogs } from "../../controllers/admin/audit.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("audit.read"), asyncHandler(listAuditLogs));
export default router;
