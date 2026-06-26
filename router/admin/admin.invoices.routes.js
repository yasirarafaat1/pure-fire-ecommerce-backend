import { Router } from "express";
import {
  bulkDownloadInvoices,
  downloadInvoice,
  ensureInvoiceForOrder,
  getInvoice,
  listInvoices,
} from "../../controllers/admin/invoices.controller.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

router.get("/", requireAdminPermission("orders.read"), asyncHandler(listInvoices));
router.post("/bulk-download", requireAdminPermission("orders.read"), asyncHandler(bulkDownloadInvoices));
router.post("/ensure-for-order/:orderId", requireAdminPermission("orders.read"), asyncHandler(ensureInvoiceForOrder));
router.get("/:id/download", requireAdminPermission("orders.read"), asyncHandler(downloadInvoice));
router.get("/:id", requireAdminPermission("orders.read"), asyncHandler(getInvoice));

export default router;
