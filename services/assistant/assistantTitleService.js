import AssistantMessage from "../../model/assistantMessage.model.js";
import AssistantSession from "../../model/assistantSession.model.js";

const titleCase = (value = "") =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

export const fallbackAssistantTitle = (message = "", intent = "") => {
  const clean = String(message || "")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
    .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "")
    .replace(/\b\d{5,}\b/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const source = clean || String(intent || "Assistant chat").replace(/_/g, " ");
  const words = source.split(/\s+/).filter(Boolean).slice(0, 5);
  const title = titleCase(words.join(" "));
  return title || "Assistant Chat";
};

export const generateAssistantTitle = async ({ message, intent }) => {
  const fallback = fallbackAssistantTitle(message, intent);
  const enabled = String(process.env.ASSISTANT_AI_ENABLED || "false").toLowerCase() === "true";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!enabled || !apiKey) return fallback;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const safeMessage = String(message || "")
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
      .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "[phone]")
      .replace(/\b\d{5,}\b/g, "[number]")
      .slice(0, 220);
    const prompt = [
      "Create a short ecommerce chat history title.",
      "Use Title Case, 2 to 5 words, no punctuation, no quotes.",
      "Do not include private identifiers like phone, email, or order numbers.",
      `Intent: ${intent || "unknown"}`,
      `First user message: ${safeMessage}`,
    ].join("\n");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "")
      .replace(/["'`]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = text.split(/\s+/).filter(Boolean).slice(0, 5);
    return titleCase(words.join(" ")) || fallback;
  } catch {
    return fallback;
  }
};

export const ensureAssistantSessionTitle = async ({ sessionId, message, intent }) => {
  const session = await AssistantSession.findOne({ sessionId }).select("title").lean();
  if (!session || (session.title && session.title !== "Assistant chat")) return session?.title || "";

  const firstUserMessage =
    (await AssistantMessage.findOne({ sessionId, role: "user" }).sort({ createdAt: 1 }).lean())?.content ||
    message ||
    "";
  const title = await generateAssistantTitle({ message: firstUserMessage, intent });
  await AssistantSession.updateOne({ sessionId }, { $set: { title } });
  return title;
};
