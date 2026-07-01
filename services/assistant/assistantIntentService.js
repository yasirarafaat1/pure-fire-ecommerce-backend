import { parseSearchQuery } from "../../utils/search.js";

const restrictedIntents = new Set([
  "profile_summary",
  "my_orders",
  "latest_order",
  "wishlist_view",
  "address_view",
]);

const replaceMany = (value, pairs) =>
  pairs.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), value);

const languageAliases = [
  [/\bmera\b|\bmeri\b|\bmere\b|\bmy\b|मेरा|मेरी|मेरे/g, " my "],
  [/\border\b|\borders\b|ऑर्डर|आर्डर/g, " order "],
  [/\bdikhao\b|\bdikha do\b|\bbatao\b|\bbtao\b|\bchahiye\b|\bchaiye\b|\bdo\b|दिखाओ|बताओ|चाहिए/g, " show "],
  [/\bkhojo\b|\bdhundo\b|\bsearch karo\b|खोजो|ढूंढो/g, " search "],
  [/\bsujhao\b|\bsuggest karo\b|\brecommend karo\b|सुझाओ/g, " suggest "],
  [/\bsabse achha\b|\bbadhiya\b|\bachha\b|\bpopular\b|सबसे अच्छा|बढ़िया|लोकप्रिय/g, " best "],
  [/\bnaya\b|\bnaye\b|\bnayi\b|\blatest\b|नया|नए|नई/g, " new "],
  [/\bke andar\b|\bse kam\b|\bkam mein\b|\bke niche\b|\bandar\b|\btak\b|के अंदर|से कम|तक|नीचे/g, " below "],
  [/\bse zyada\b|\bke upar\b|\bzyada\b|\bupar\b|से ज्यादा|ऊपर/g, " above "],
  [/\bbeech\b|\bke beech\b|बीच/g, " between "],
  [/\brupaye\b|\brupees\b|\brs\b|\binr\b|रुपये|रुपया/g, " rs "],
  [/\bkaala\b|\bkala\b|\bblack\b|काला|ब्लैक/g, " black "],
  [/\bsafed\b|\bwhite\b|सफेद|व्हाइट/g, " white "],
  [/\blaal\b|\bred\b|लाल|रेड/g, " red "],
  [/\bneela\b|\bnila\b|\bblue\b|नीला|ब्लू/g, " blue "],
  [/\bhara\b|\bgreen\b|हरा|ग्रीन/g, " green "],
  [/\bpeela\b|\byellow\b|पीला|येलो/g, " yellow "],
  [/\bgulabi\b|\bpink\b|गुलाबी|पिंक/g, " pink "],
  [/\bkapde\b|\bclothes\b|\bvastra\b|कपड़े|कपडा|कपड़ा/g, " clothes "],
  [/\blehnga\b|\blehenga\b|लहंगा/g, " lehenga "],
  [/\bkurti\b|\bkurta\b|कुर्ती|कुर्ता/g, " kurta "],
  [/\bdress\b|\bfrock\b|ड्रेस/g, " dress "],
  [/\bshirt\b|\bshirts\b|शर्ट/g, " shirt "],
  [/\btshirt\b|\bt-shirt\b|टीशर्ट|टी-शर्ट/g, " tshirt "],
  [/\bsaree\b|\bsari\b|साड़ी|साड़ी/g, " saree "],
  [/\bjaggery\b|\bgud\b|\bgur\b|गुड़|गुड़/g, " jaggery "],
];

const normalizeAssistantText = (message = "") => {
  const raw = String(message || "").normalize("NFKC").toLowerCase();
  const spaced = raw
    .replace(/[₹]/g, " rs ")
    .replace(/[?!.,"'`~()[\]{}:;|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return replaceMany(spaced, languageAliases)
    .replace(/\b(\d+(?:\.\d+)?)\s+(?:ke\s+)?below\b/g, " below $1 ")
    .replace(/\b(\d+(?:\.\d+)?)\s+(?:ke\s+)?above\b/g, " above $1 ")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeProductQuery = (message = "") => {
  const normalized = normalizeAssistantText(message);
  return normalized
    .replace(/\b(show|find|search|suggest|recommend|please|plz|mujhe|hame|hume|my|product|products)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const hasAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const hasCountRequest = (text) =>
  hasAny(text, [
    /\bcount\b/,
    /\bcounts\b/,
    /\bquantity\b/,
    /\bnumber\b/,
    /\bhow many\b/,
    /\bkitne\b/,
    /\bkitni\b/,
    /\bkitna\b/,
    /\bqunatity\b/,
    /कितने/,
    /कितनी/,
    /गिनती/,
  ]) &&
  hasAny(text, [
    /\bcart\b/,
    /\bbag\b/,
    /\bbasket\b/,
    /\bwishlist\b/,
    /\bsaved\b/,
    /\border\b/,
    /\borders\b/,
    /\baddress\b/,
    /\baddresses\b/,
    /\baccount\b/,
    /\bsab\b/,
    /\ball\b/,
    /कार्ट/,
    /विशलिस्ट/,
    /ऑर्डर/,
    /एड्रेस/,
  ]);

const hasBuyRequest = (text) =>
  hasAny(text, [
    /\bbuy\b/,
    /\bbuy now\b/,
    /\bpurchase\b/,
    /\bcheckout\b/,
    /\bplace order\b/,
    /\border place\b/,
    /\border kar\b/,
    /\border kr\b/,
    /\bkharid\b/,
    /\blena hai\b/,
    /\ble lo\b/,
    /\bye product buy\b/,
    /\bis product buy\b/,
    /\bthis product buy\b/,
  ]);

export const extractOrderId = (message = "") => {
  const text = normalizeAssistantText(message);
  const explicit = text.match(/(?:order|track)\s*(?:id|#|number|no|नंबर)\s*[:#-]?\s*([a-z0-9_-]{4,})/i);
  if (explicit) return explicit[1].replace(/^id/i, "");
  const numeric = text.match(/\b\d{4,}\b/);
  return numeric?.[0] || "";
};

export const detectAssistantIntent = (message = "") => {
  const raw = String(message || "").trim();
  const text = normalizeAssistantText(raw);
  const productQuery = normalizeProductQuery(raw);
  const parsed = parseSearchQuery(productQuery || text || raw);
  const orderId = extractOrderId(raw);
  const genericProductRequest = /^(find|show|search|suggest|recommend)?\s*(products?|items|shopping|clothes)?\s*$/.test(text);

  let intent = "unknown";
  let confidence = 0.5;

  if (!text || /^(hi|hello|hey|namaste|hii|hola|namaskar|नमस्ते|नमस्कार)\b/.test(text)) {
    intent = "greeting";
    confidence = 0.9;
  } else if (hasAny(text, [/\blogout\b/, /\blog out\b/, /\bsign out\b/, /\blogout kar\b/, /\blogout kr\b/, /\bbahar nikal\b/, /लॉगआउट/, /लॉग आउट/])) {
    intent = "logout_confirm";
    confidence = 0.95;
  } else if (hasAny(text, [/\blogin\b/, /\blog in\b/, /\bsign in\b/, /\blogin kar\b/, /\blogin kr\b/, /\baccount login\b/, /लॉगिन/, /लॉग इन/])) {
    intent = "login_start";
    confidence = 0.95;
  } else if (hasBuyRequest(text)) {
    intent = "product_buy";
    confidence = 0.96;
  } else if (hasAny(text, [/\bthis page\b/, /\bcurrent page\b/, /\babout this\b/, /\bexplain this\b/, /\bthis product\b/, /\bcurrent product\b/, /\bis product\b/, /\bye product\b/, /\bis page\b/, /\bye page\b/, /\biske baare\b/, /\biski detail\b/, /\bdetails?\b/])) {
    intent = hasAny(text, [/\bproduct\b/, /\bis product\b/, /\bye product\b/, /\bcurrent product\b/]) ? "product_detail" : "page_context";
    confidence = 0.92;
  } else if (hasCountRequest(text)) {
    intent = "account_counts";
    confidence = 0.94;
  } else if (hasAny(text, [/\bmy orders\b/, /\ball orders\b/, /\border history\b/, /\bmy order list\b/, /\bmy order\b.*\b(show|list)\b/, /\bshow\b.*\bmy order\b/, /मेरे order/, /मेरे ऑर्डर/])) {
    intent = "my_orders";
    confidence = 0.95;
  } else if (hasAny(text, [/\blast order\b/, /\blatest order\b/, /\brecent order\b/, /\bpichla order\b/, /\bakhri order\b/, /पिछला order/, /आखिरी order/])) {
    intent = "latest_order";
    confidence = 0.95;
  } else if (hasAny(text, [/\bwhere is my order\b/, /\border status\b/, /\btrack\b/, /\btracking\b/, /\bmy order\b/, /\border kaha\b/, /\border kidhar\b/, /\bstatus\b/, /order कहां/, /ऑर्डर कहां/, /ट्रैक/])) {
    intent = "order_status";
    confidence = 0.9;
  } else if (hasAny(text, [/\bwishlist\b/, /\bsaved\b/, /\bpasand\b/, /\bfavorite\b/, /\bfavourite\b/, /पसंद/, /विशलिस्ट/])) {
    intent = "wishlist_view";
    confidence = 0.9;
  } else if (hasAny(text, [/\baddress\b/, /\bsaved address\b/, /\bdelivery address\b/, /\bpata\b/, /पता/, /एड्रेस/])) {
    intent = "address_view";
    confidence = 0.9;
  } else if (hasAny(text, [/\bprofile\b/, /\baccount\b/, /\bmy info\b/, /\bmy profile\b/, /प्रोफाइल/, /अकाउंट/])) {
    intent = "profile_summary";
    confidence = 0.9;
  } else if (hasAny(text, [/\bcart\b/, /\bbag\b/, /\bbasket\b/, /\btokri\b/, /कार्ट/, /बैग/])) {
    intent = "cart_view";
    confidence = 0.9;
  } else if (hasAny(text, [/\bbest sellers?\b/, /\bbestsellers?\b/, /\btop products?\b/])) {
    intent = "best_sellers";
    confidence = 0.9;
  } else if (hasAny(text, [/\bbest seller\b/, /\bbestseller\b/, /\btop product\b/, /\bpopular\b/, /\bbest products?\b/, /सबसे best/, /लोकप्रिय/])) {
    intent = "best_sellers";
    confidence = 0.9;
  } else if (hasAny(text, [/\bnew arrival\b/, /\blatest product\b/, /\bnew product\b/, /\bfresh\b/, /\bnew\b/, /नया product/, /नए product/])) {
    intent = "new_arrivals";
    confidence = 0.9;
  } else if (hasAny(text, [/\breturn\b/, /\brefund\b/, /\bexchange\b/, /\bwapis\b/, /\bwapas\b/, /वापस/, /रिफंड/, /एक्सचेंज/])) {
    intent = "return_policy";
    confidence = 0.9;
  } else if (hasAny(text, [/\bshipping\b/, /\bdelivery\b/, /\bship\b/, /\bdeliver\b/, /\bkab aayega\b/, /\bpahuch\b/, /डिलीवरी/, /शिपिंग/, /कब आएगा/])) {
    intent = "shipping_policy";
    confidence = 0.9;
  } else if (hasAny(text, [/\bpayment\b/, /\bpay\b/, /\bcod\b/, /\brazorpay\b/, /\bpaise\b/, /पेमेंट/, /भुगतान/, /कैश/])) {
    intent = "payment_policy";
    confidence = 0.85;
  } else if (hasAny(text, [/\bhelp\b/, /\bsupport\b/, /\bcomplaint\b/, /\bissue\b/, /\bproblem\b/, /\bmadad\b/, /\bshikayat\b/, /मदद/, /शिकायत/, /समस्या/])) {
    intent = "support_request";
    confidence = 0.8;
  } else if (
    genericProductRequest ||
    /\b(suggest|recommend|show|find|search|under|below|above|between|kurta|lehenga|dress|shirt|tshirt|saree|jaggery|black|white|red|blue|green|yellow|pink|clothes)\b/.test(text) ||
    parsed.textTokens.length ||
    parsed.minPrice !== null ||
    parsed.maxPrice !== null
  ) {
    intent = genericProductRequest || /(suggest|recommend)/.test(text) ? "product_recommendation" : "product_search";
    confidence = 0.8;
  }

  return {
    intent,
    confidence,
    orderId,
    productQuery: genericProductRequest ? "" : productQuery,
    normalizedText: text,
    filters: {
      priceMin: parsed.minPrice,
      priceMax: parsed.maxPrice,
      keywords: parsed.textTokens,
    },
    requiresLogin: restrictedIntents.has(intent),
  };
};
