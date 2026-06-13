import { Router } from "express";
import {
  getOrder,
  listOrders,
  updateOrderStatus,
  updateShipping,
} from "../../controllers/admin/orders.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("orders.read"), asyncHandler(listOrders));
router.get("/:id", requireAdminPermission("orders.read"), asyncHandler(getOrder));
router.post("/:id/transition", requireAdminPermission("orders.manage"), asyncHandler(updateOrderStatus));
router.patch("/:id/shipping", requireAdminPermission("shipping.manage"), asyncHandler(updateShipping));
export default router;
