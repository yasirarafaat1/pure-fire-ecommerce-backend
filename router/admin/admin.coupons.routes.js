import { Router } from "express";
import {
  createCoupon,
  deleteCoupon,
  listCoupons,
  updateCoupon,
} from "../../controllers/admin/coupons.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const manage = requireAdminPermission("coupons.manage");
router.get("/", manage, asyncHandler(listCoupons));
router.post("/", manage, auditAdminAction("COUPON_CREATED", "COUPON"), asyncHandler(createCoupon));
router.patch(
  "/:id",
  manage,
  auditAdminAction("COUPON_UPDATED", "COUPON", (req) => req.params.id),
  asyncHandler(updateCoupon)
);
router.delete(
  "/:id",
  manage,
  auditAdminAction("COUPON_DELETED", "COUPON", (req) => req.params.id),
  asyncHandler(deleteCoupon)
);
export default router;
