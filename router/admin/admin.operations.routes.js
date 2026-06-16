import { Router } from "express";
import {
  listPayments,
  listReturns,
  listShipping,
  markManualRefund,
} from "../../controllers/admin/operations.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/shipping", requireAdminPermission("shipping.read"), asyncHandler(listShipping));
router.get("/payments", requireAdminPermission("payments.read"), asyncHandler(listPayments));
router.get("/returns", requireAdminPermission("returns.manage"), asyncHandler(listReturns));
router.post(
  "/payments/:id/refund",
  requireAdminPermission("payments.manage"),
  auditAdminAction("REFUND_MARKED", "ORDER", (req) => req.params.id),
  asyncHandler(markManualRefund)
);
export default router;
