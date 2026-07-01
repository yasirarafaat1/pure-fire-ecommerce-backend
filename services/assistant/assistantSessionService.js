import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import AssistantSession from "../../model/assistantSession.model.js";

const hashIp = (ip = "") =>
  ip ? crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 32) : null;

export const createOrResumeAssistantSession = async ({ sessionId, guestId, userId, req }) => {
  const safeSessionId = String(sessionId || "").trim();
  const query = safeSessionId
    ? { sessionId: safeSessionId }
    : userId
      ? { userId, status: "active" }
      : guestId
        ? { guestId, status: "active" }
        : null;

  let session = query ? await AssistantSession.findOne(query) : null;
  if (!session) {
    session = await AssistantSession.create({
      sessionId: safeSessionId || uuidv4(),
      userId: userId || null,
      guestId: guestId || null,
      source: "web",
      userAgent: req?.headers?.["user-agent"] || null,
      ipHash: hashIp(req?.ip),
      lastMessageAt: new Date(),
    });
  } else {
    if (userId && session.userId !== userId) session.userId = userId;
    if (guestId && !session.guestId) session.guestId = guestId;
    session.lastMessageAt = new Date();
    await session.save();
  }
  return session;
};

export const touchAssistantSession = async (sessionId, intent) => {
  await AssistantSession.updateOne(
    { sessionId },
    { $set: { lastMessageAt: new Date(), lastIntent: intent || null } }
  );
};

export const canAccessSession = (session, { userId, guestId }) => {
  if (!session) return false;
  if (userId && session.userId === userId) return true;
  if (!userId && guestId && session.guestId === guestId) return true;
  return false;
};
