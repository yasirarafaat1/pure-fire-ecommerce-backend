import AssistantMessage from "../../model/assistantMessage.model.js";

export const saveAssistantMessage = async ({
  sessionId,
  userId,
  role,
  content,
  intent,
  cards = [],
  suggestions = [],
  toolCalls = [],
  metadata = null,
}) =>
  AssistantMessage.create({
    sessionId,
    userId: userId || null,
    role,
    content: String(content || "").slice(0, 5000),
    intent: intent || null,
    cards,
    suggestions,
    toolCalls,
    metadata,
  });

export const getAssistantHistory = async (sessionId, limit = 40) =>
  AssistantMessage.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 40, 80))
    .lean()
    .then((rows) => rows.reverse());
