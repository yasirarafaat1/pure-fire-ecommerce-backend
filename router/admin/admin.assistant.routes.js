import { Router } from "express";
import {
  getAssistantAnalyticsController,
  getAssistantSessionController,
  listAssistantSessionsController,
} from "../../controllers/admin/assistant.controller.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

router.get("/sessions", asyncHandler(listAssistantSessionsController));
router.get("/sessions/:sessionId", asyncHandler(getAssistantSessionController));
router.get("/analytics", asyncHandler(getAssistantAnalyticsController));

export default router;
