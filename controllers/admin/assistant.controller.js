import AssistantMessage from "../../model/assistantMessage.model.js";
import AssistantSession from "../../model/assistantSession.model.js";
import AssistantFeedback from "../../model/assistantFeedback.model.js";
import { fallbackAssistantTitle } from "../../services/assistant/assistantTitleService.js";

const parseLimit = (value, fallback = 30, max = 100) =>
  Math.min(Math.max(Number.parseInt(value || fallback, 10) || fallback, 1), max);

const buildDateFilter = (range = "30d") => {
  const now = new Date();
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const from = new Date(now);
  from.setDate(now.getDate() - days);
  return { $gte: from };
};

export const listAssistantSessionsController = async (req, res) => {
  const limit = parseLimit(req.query.limit, 30, 100);
  const page = Math.max(Number.parseInt(req.query.page || "1", 10) || 1, 1);
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim();

  const filter = {};
  if (status && ["active", "closed"].includes(status)) filter.status = status;
  if (search) {
    filter.$or = [
      { sessionId: { $regex: search, $options: "i" } },
      { userId: { $regex: search, $options: "i" } },
      { guestId: { $regex: search, $options: "i" } },
      { title: { $regex: search, $options: "i" } },
      { lastIntent: { $regex: search, $options: "i" } },
    ];
  }

  const [total, sessions] = await Promise.all([
    AssistantSession.countDocuments(filter),
    AssistantSession.find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const sessionIds = sessions.map((session) => session.sessionId);
  const [messageCounts, lastMessages] = await Promise.all([
    AssistantMessage.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]),
    AssistantMessage.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$sessionId", content: { $first: "$content" }, role: { $first: "$role" }, createdAt: { $first: "$createdAt" } } },
    ]),
  ]);

  const countMap = new Map(messageCounts.map((row) => [row._id, row.count]));
  const lastMap = new Map(lastMessages.map((row) => [row._id, row]));

  return res.json({
    status: true,
    data: {
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.title || fallbackAssistantTitle(lastMap.get(session.sessionId)?.content, session.lastIntent),
        userId: session.userId,
        guestId: session.guestId,
        status: session.status,
        source: session.source,
        lastIntent: session.lastIntent,
        lastMessageAt: session.lastMessageAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: countMap.get(session.sessionId) || 0,
        lastMessage: lastMap.get(session.sessionId) || null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
};

export const getAssistantSessionController = async (req, res) => {
  const sessionId = String(req.params.sessionId || "").trim();
  const session = await AssistantSession.findOne({ sessionId }).lean();
  if (!session) {
    return res.status(404).json({ status: false, message: "Assistant session not found" });
  }
  const messages = await AssistantMessage.find({ sessionId }).sort({ createdAt: 1 }).lean();
  const feedback = await AssistantFeedback.find({ sessionId }).sort({ createdAt: -1 }).lean();
  return res.json({ status: true, data: { session, messages, feedback } });
};

export const getAssistantAnalyticsController = async (req, res) => {
  const range = String(req.query.range || "30d");
  const createdAt = buildDateFilter(range);
  const match = { createdAt };

  const [
    totalSessions,
    totalMessages,
    activeSessions,
    userSessions,
    guestSessions,
    intentBreakdown,
    dailyMessages,
    feedbackBreakdown,
  ] = await Promise.all([
    AssistantSession.countDocuments(match),
    AssistantMessage.countDocuments(match),
    AssistantSession.countDocuments({ ...match, status: "active" }),
    AssistantSession.countDocuments({ ...match, userId: { $ne: null } }),
    AssistantSession.countDocuments({ ...match, userId: null }),
    AssistantMessage.aggregate([
      { $match: { ...match, role: "assistant", intent: { $ne: null } } },
      { $group: { _id: "$intent", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    AssistantMessage.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, messages: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AssistantFeedback.aggregate([
      { $match: match },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
    ]),
  ]);

  return res.json({
    status: true,
    data: {
      range,
      kpis: {
        totalSessions,
        totalMessages,
        activeSessions,
        userSessions,
        guestSessions,
        averageMessagesPerSession: totalSessions ? Number((totalMessages / totalSessions).toFixed(1)) : 0,
      },
      intentBreakdown: intentBreakdown.map((row) => ({ intent: row._id || "unknown", count: row.count })),
      dailyMessages: dailyMessages.map((row) => ({ date: row._id, messages: row.messages })),
      feedbackBreakdown: feedbackBreakdown.map((row) => ({ rating: row._id, count: row.count })),
    },
  });
};
