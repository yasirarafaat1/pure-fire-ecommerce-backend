import { Router } from "express";
import { getDashboard } from "../../controllers/admin/dashboard.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("dashboard.read"), asyncHandler(getDashboard));
export default router;
