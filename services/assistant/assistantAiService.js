export const refineIntentWithAi = async ({ message, current }) => {
  const enabled = String(process.env.ASSISTANT_AI_ENABLED || "false").toLowerCase() === "true";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!enabled || !apiKey || current.confidence >= 0.75) return current;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = [
      "Classify this ecommerce assistant request into one intent only.",
      "Allowed intents: product_search, product_recommendation, product_detail, product_buy, page_context, best_sellers, new_arrivals, order_status, my_orders, latest_order, profile_summary, wishlist_view, address_view, cart_view, account_counts, shipping_policy, return_policy, payment_policy, support_request, greeting, unknown.",
      "Return only JSON like {\"intent\":\"product_search\"}.",
      `Message: ${String(message || "").slice(0, 300)}`,
    ].join("\n");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) return current;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const json = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!json?.intent) return current;
    return { ...current, intent: json.intent, confidence: 0.76, aiModel: model };
  } catch {
    return current;
  }
};

const parseJsonText = (text = "") => {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

export const generateLauncherSuggestionsWithAi = async ({ context = {}, fallback = [] }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = [
      "Generate short clickable closed-launcher questions for an ecommerce shopping assistant.",
      "Return only JSON like {\"questions\":[\"Question one?\",\"Question two?\"]}.",
      "Rules:",
      "- 4 to 6 questions only.",
      "- Hinglish or simple English is okay.",
      "- Each question must be under 58 characters.",
      "- Make them relevant to the current page.",
      "- Do not ask for private account data unless the page is account/order/profile related.",
      `Page type: ${String(context.pageType || "home")}`,
      `Page title: ${String(context.title || context.productTitle || "")}`,
      `Current path: ${String(context.currentPath || "")}`,
      `Fallback examples: ${fallback.join(" | ")}`,
    ].join("\n");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 220 },
      }),
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const json = parseJsonText(text);
    const questions = Array.isArray(json?.questions)
      ? json.questions
          .map((item) => String(item || "").replace(/\s+/g, " ").trim())
          .filter((item) => item.length >= 6 && item.length <= 80)
          .slice(0, 6)
      : [];
    return questions.length ? questions : fallback;
  } catch {
    return fallback;
  }
};
