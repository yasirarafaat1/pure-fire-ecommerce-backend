import { Router } from "express";
import {
  getCustomer,
  listCustomers,
} from "../../controllers/admin/customers.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
router.get("/", requireAdminPermission("customers.read"), asyncHandler(listCustomers));
router.get("/:email", requireAdminPermission("customers.read"), asyncHandler(getCustomer));
export default router;
