import AssistantFeedback from "../../model/assistantFeedback.model.js";
import AssistantSession from "../../model/assistantSession.model.js";
import { detectAssistantIntent } from "../../services/assistant/assistantIntentService.js";
import { refineIntentWithAi } from "../../services/assistant/assistantAiService.js";
import {
  canAccessSession,
  createOrResumeAssistantSession,
  touchAssistantSession,
} from "../../services/assistant/assistantSessionService.js";
import {
  getAssistantHistory,
  saveAssistantMessage,
} from "../../services/assistant/assistantMessageService.js";
import { ensureAssistantSessionTitle, fallbackAssistantTitle } from "../../services/assistant/assistantTitleService.js";
import {
  lookupOrderById,
  runAssistantTool,
} from "../../services/assistant/assistantToolService.js";

const sanitizeText = (value, max = 1000) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const userSummary = (email) =>
  email ? { emailMasked: email.replace(/^(.{2}).*(@.*)$/, "$1***$2") } : null;

const sanitizeReplyTo = (value) => {
  if (!value || typeof value !== "object") return null;
  const role = ["user", "assistant", "system", "tool"].includes(value.role) ? value.role : "";
  const content = sanitizeText(value.content, 500);
  if (!role || !content) return null;
  return {
    id: sanitizeText(value.id, 160),
    role,
    content,
  };
};

export const createAssistantSession = async (req, res) => {
  try {
    const userId = req.assistantAuth?.email || "";
    const guestId = sanitizeText(req.body?.guestId, 160);
    const session = await createOrResumeAssistantSession({
      sessionId: sanitizeText(req.body?.sessionId, 160),
      guestId,
      userId,
      req,
    });
    return res.status(200).json({
      status: true,
      sessionId: session.sessionId,
      isAuthenticated: Boolean(userId),
      user: userSummary(userId),
    });
  } catch (error) {
    console.error("createAssistantSession error:", error);
    return res.status(500).json({ status: false, message: "Failed to start assistant" });
  }
};

export const sendAssistantMessage = async (req, res) => {
  const startedAt = Date.now();
  try {
    const userId = req.assistantAuth?.email || "";
    const guestId = sanitizeText(req.body?.guestId, 160);
    const message = sanitizeText(req.body?.message, 1500);
    if (!message) {
      return res.status(400).json({ status: false, message: "Message required" });
    }

    const session = await createOrResumeAssistantSession({
      sessionId: sanitizeText(req.body?.sessionId, 160),
      guestId,
      userId,
      req,
    });

    const incomingReplyTo = sanitizeReplyTo(req.body?.context?.replyTo);
    const userMessage = await saveAssistantMessage({
      sessionId: session.sessionId,
      userId,
      role: "user",
      content: message,
      metadata: {
        replyTo: incomingReplyTo,
      },
    });
    const assistantReplyTo = {
      id: String(userMessage._id || ""),
      role: "user",
      content: message,
    };

    const detected = detectAssistantIntent(message);
    const refined = await refineIntentWithAi({ message, current: detected });
    const result = await runAssistantTool({
      intent: refined.intent,
      message: refined.productQuery ?? message,
      auth: req.assistantAuth,
      context: req.body?.context || {},
      orderId: refined.orderId,
    });

    const assistantMessage = await saveAssistantMessage({
      sessionId: session.sessionId,
      userId,
      role: "assistant",
      content: result.message,
      intent: refined.intent,
      cards: result.cards,
      suggestions: result.suggestions,
      toolCalls: [{ intent: refined.intent }],
      metadata: {
        replyTo: assistantReplyTo,
        latencyMs: Date.now() - startedAt,
        model: refined.aiModel || null,
      },
    });
    await ensureAssistantSessionTitle({
      sessionId: session.sessionId,
      message,
      intent: refined.intent,
    });
    await touchAssistantSession(session.sessionId, refined.intent);

    return res.status(200).json({
      status: true,
      sessionId: session.sessionId,
      messageId: assistantMessage._id,
      message: result.message,
      intent: refined.intent,
      cards: result.cards || [],
      suggestions: result.suggestions || [],
      replyTo: assistantReplyTo,
    });
  } catch (error) {
    console.error("sendAssistantMessage error:", error);
    return res.status(500).json({ status: false, message: "Assistant failed to respond" });
  }
};

export const assistantOrderLookup = async (req, res) => {
  try {
    const userId = req.assistantAuth?.email || "";
    const guestId = sanitizeText(req.body?.guestId, 160);
    const orderId = sanitizeText(req.body?.orderId, 80);
    const session = await createOrResumeAssistantSession({
      sessionId: sanitizeText(req.body?.sessionId, 160),
      guestId,
      userId,
      req,
    });
    const result = await lookupOrderById({
      orderId,
      userEmail: userId,
      isAuthenticated: Boolean(userId),
    });
    const userMessage = await saveAssistantMessage({
      sessionId: session.sessionId,
      userId,
      role: "user",
      content: `Track order ${orderId}`,
      intent: "order_status",
    });
    const assistantReplyTo = {
      id: String(userMessage._id || ""),
      role: "user",
      content: `Track order ${orderId}`,
    };
    await ensureAssistantSessionTitle({
      sessionId: session.sessionId,
      message: `Track order ${orderId}`,
      intent: "order_status",
    });
    await saveAssistantMessage({
      sessionId: session.sessionId,
      userId,
      role: "assistant",
      content: result.message,
      intent: "order_status",
      cards: result.cards,
      suggestions: result.suggestions,
      toolCalls: [{ intent: "order_status", orderId }],
      metadata: { replyTo: assistantReplyTo },
    });
    return res.status(200).json({
      status: true,
      sessionId: session.sessionId,
      message: result.message,
      intent: "order_status",
      cards: result.cards,
      suggestions: result.suggestions,
      replyTo: assistantReplyTo,
    });
  } catch (error) {
    console.error("assistantOrderLookup error:", error);
    return res.status(500).json({ status: false, message: "Failed to lookup order" });
  }
};

export const assistantFeedback = async (req, res) => {
  try {
    const rating = req.body?.rating;
    if (!["up", "down"].includes(rating)) {
      return res.status(400).json({ status: false, message: "Invalid rating" });
    }
    await AssistantFeedback.create({
      sessionId: sanitizeText(req.body?.sessionId, 160),
      messageId: sanitizeText(req.body?.messageId, 160),
      rating,
      comment: sanitizeText(req.body?.comment, 500),
    });
    return res.status(200).json({ status: true, message: "Feedback saved" });
  } catch (error) {
    console.error("assistantFeedback error:", error);
    return res.status(500).json({ status: false, message: "Failed to save feedback" });
  }
};

export const assistantHistory = async (req, res) => {
  try {
    const userId = req.assistantAuth?.email || "";
    const guestId = sanitizeText(req.query?.guestId, 160);
    const sessionId = sanitizeText(req.query?.sessionId, 160);
    const session = await AssistantSession.findOne({ sessionId }).lean();
    if (!canAccessSession(session, { userId, guestId })) {
      return res.status(403).json({ status: false, message: "History unavailable" });
    }
    const messages = await getAssistantHistory(sessionId);
    return res.status(200).json({ status: true, messages });
  } catch (error) {
    console.error("assistantHistory error:", error);
    return res.status(500).json({ status: false, message: "Failed to load history" });
  }
};

export const assistantSessions = async (req, res) => {
  try {
    const userId = req.assistantAuth?.email || "";
    const guestId = sanitizeText(req.query?.guestId, 160);
    const filter = userId ? { userId } : guestId ? { guestId } : null;
    if (!filter) {
      return res.status(400).json({ status: false, message: "Session identity required" });
    }

    const sessions = await AssistantSession.find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .limit(20)
      .lean();

    return res.status(200).json({
      status: true,
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.title || fallbackAssistantTitle("", session.lastIntent),
        status: session.status,
        lastIntent: session.lastIntent,
        lastMessageAt: session.lastMessageAt,
        createdAt: session.createdAt,
        isAuthenticated: Boolean(session.userId),
      })),
    });
  } catch (error) {
    console.error("assistantSessions error:", error);
    return res.status(500).json({ status: false, message: "Failed to load sessions" });
  }
};
