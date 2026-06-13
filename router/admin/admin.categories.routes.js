import { Router } from "express";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../../controllers/admin/categories.controller.js";
import { getCategoryTree } from "../../controller/admin.controller.js";
import { auditAdminAction } from "../../middleware/adminAudit.middleware.js";
import { requireAdminPermission } from "../../middleware/adminPermission.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();
const manage = requireAdminPermission("categories.manage");

router.get("/", manage, asyncHandler(listCategories));
router.get("/tree", manage, asyncHandler(getCategoryTree));
router.post(
  "/",
  manage,
  auditAdminAction("CATEGORY_CREATED", "CATEGORY"),
  asyncHandler(createCategory)
);
router.patch(
  "/:id",
  manage,
  auditAdminAction("CATEGORY_UPDATED", "CATEGORY", (req) => req.params.id),
  asyncHandler(updateCategory)
);
router.delete(
  "/:id",
  manage,
  auditAdminAction("CATEGORY_DELETED", "CATEGORY", (req) => req.params.id),
  asyncHandler(deleteCategory)
);

export default router;
