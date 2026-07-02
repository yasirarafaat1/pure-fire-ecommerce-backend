import { Router } from "express";
import {
  getCustomer,
  listCustomers,
  updateCustomerStatus,
} from "../../controllers/admin/customers.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("customers.read"), asyncHandler(listCustomers));
router.patch("/:email/status", requireAdminPermission("customers.manage"), asyncHandler(updateCustomerStatus));
router.get("/:email", requireAdminPermission("customers.read"), asyncHandler(getCustomer));
export default router;
