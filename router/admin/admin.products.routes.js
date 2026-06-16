import { Router } from "express";
import {
  createDraftProduct,
  deleteDraft,
  deleteProduct,
  updateDraft,
  updateProduct,
  uploadProduct,
} from "../../controller/admin.controller.js";
import {
  getProduct,
  listDrafts,
  listInventory,
  listProducts,
  updateInventory,
} from "../../controllers/admin/products.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { productUpload } from "../../middleware/multer.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const manage = requireAdminPermission("products.manage");

router.get("/", manage, asyncHandler(listProducts));
router.get("/drafts", manage, asyncHandler(listDrafts));
router.get("/inventory", requireAdminPermission("inventory.read"), asyncHandler(listInventory));
router.get("/:id", manage, asyncHandler(getProduct));
router.post(
  "/",
  manage,
  productUpload.any(),
  auditAdminAction("PRODUCT_CREATED", "PRODUCT"),
  asyncHandler(uploadProduct)
);
router.patch(
  "/:product_id",
  manage,
  productUpload.any(),
  auditAdminAction("PRODUCT_UPDATED", "PRODUCT", (req) => req.params.product_id),
  asyncHandler(updateProduct)
);
router.delete(
  "/:product_id",
  manage,
  (req, _res, next) => {
    req.body = { ...req.body, productId: req.params.product_id };
    next();
  },
  auditAdminAction("PRODUCT_DELETED", "PRODUCT", (req) => req.params.product_id),
  asyncHandler(deleteProduct)
);
router.post(
  "/drafts",
  manage,
  productUpload.any(),
  auditAdminAction("PRODUCT_DRAFT_CREATED", "PRODUCT_DRAFT"),
  asyncHandler(createDraftProduct)
);
router.patch(
  "/drafts/:draft_id",
  manage,
  productUpload.any(),
  auditAdminAction("PRODUCT_DRAFT_UPDATED", "PRODUCT_DRAFT", (req) => req.params.draft_id),
  asyncHandler(updateDraft)
);
router.delete(
  "/drafts/:draft_id",
  manage,
  auditAdminAction("PRODUCT_DRAFT_DELETED", "PRODUCT_DRAFT", (req) => req.params.draft_id),
  asyncHandler(deleteDraft)
);
router.patch(
  "/:id/inventory",
  requireAdminPermission("inventory.manage"),
  auditAdminAction("INVENTORY_UPDATED", "PRODUCT", (req) => req.params.id),
  asyncHandler(updateInventory)
);

export default router;
