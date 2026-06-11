import { Router } from "express";
import {
  adminLogin,
  adminResetPassword,
  adminLogout,
  sendUserOtp,
  verifyUserOtp,
} from "../controller/auth.controller.js";

const router = Router();

router.post("/admin-login", adminLogin);
router.post("/admin-logout", adminLogout);
router.post("/admin-reset", adminResetPassword);
router.post("/user/send-otp", sendUserOtp);
router.post("/user/verify-otp", verifyUserOtp);

export { router };
export default router;
