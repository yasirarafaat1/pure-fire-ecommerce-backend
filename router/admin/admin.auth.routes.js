import { Router } from "express";
import {
  changeAdminPassword,
  getCurrentAdmin,
  loginAdmin,
  logoutAdmin,
} from "../../controllers/admin/adminAuth.controller.js";
import { requireAdminAuth } from "../../middleware/adminAuth.middleware.js";
import { adminLoginRateLimit } from "../../middleware/adminRateLimit.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

router.post("/login", adminLoginRateLimit, asyncHandler(loginAdmin));
router.post("/logout", requireAdminAuth, asyncHandler(logoutAdmin));
router.get("/me", requireAdminAuth, asyncHandler(getCurrentAdmin));
router.post("/change-password", requireAdminAuth, asyncHandler(changeAdminPassword));

export default router;
