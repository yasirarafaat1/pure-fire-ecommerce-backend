import { Router } from "express";
import {
  sendUserOtp,
  verifyUserOtp,
} from "../controller/auth.controller.js";

const router = Router();

router.post("/user/send-otp", sendUserOtp);
router.post("/user/verify-otp", verifyUserOtp);

export { router };
export default router;
