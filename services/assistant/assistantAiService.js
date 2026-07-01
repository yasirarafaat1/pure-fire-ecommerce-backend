export const refineIntentWithAi = async ({ message, current }) => {
  const enabled = String(process.env.ASSISTANT_AI_ENABLED || "false").toLowerCase() === "true";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!enabled || !apiKey || current.confidence >= 0.75) return current;

  try {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = [
      "Classify this ecommerce assistant request into one intent only.",
      "Allowed intents: product_search, product_recommendation, product_detail, best_sellers, new_arrivals, order_status, my_orders, latest_order, profile_summary, wishlist_view, address_view, cart_view, shipping_policy, return_policy, payment_policy, support_request, greeting, unknown.",
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
