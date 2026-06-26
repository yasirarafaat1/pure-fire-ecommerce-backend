import { Router } from "express";
import { getAnalyticsSummaryController } from "../../controllers/admin/analytics.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

router.get("/summary", requireAdminPermission("dashboard.read"), asyncHandler(getAnalyticsSummaryController));

export default router;
