const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
import { extractHexes, findColorNamesInQuery, normalizeSize } from "./searchColor.js";
export { filterProductsByColorName, pickMatchedColor } from "./searchColor.js";

const needsWordBoundary = (token) => {
  const lower = token.toLowerCase();
  return lower.length <= 3 || ["men", "women", "boy", "girl", "kid", "kids"].includes(lower);
};

const buildTokenVariants = (token) => {
  const variants = new Set([token]);
  if (token.length > 3 && token.endsWith("s")) variants.add(token.slice(0, -1));
  if (token.length > 4 && token.endsWith("es")) variants.add(token.slice(0, -2));
  return Array.from(variants).filter(Boolean);
};

export const buildTokenRegex = (token) => {
  const variants = buildTokenVariants(token).map(escapeRegex);
  const pattern = variants.join("|");
  if (!pattern) return null;
  if (needsWordBoundary(token)) {
    return new RegExp(`\\b(?:${pattern})\\b`, "i");
  }
  return new RegExp(pattern, "i");
};


export const parseSearchQuery = (input = "") => {
  const raw = input.toString();
  const q = raw.trim();
  const lower = q.toLowerCase();
  if (!q) {
    return {
      textTokens: [],
      minPrice: null,
      maxPrice: null,
      discountPercent: null,
      sizes: [],
      colorNames: [],
      colorHexes: [],
    };
  }

  let minPrice = null;
  let maxPrice = null;
  let discountPercent = null;
  let discountExact = false;

  const betweenMatch = lower.match(
    /(?:between|from)\s*(?:â‚¹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*(?:â‚¹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i
  );
  if (betweenMatch) {
    minPrice = Number(betweenMatch[1]);
    maxPrice = Number(betweenMatch[2]);
  }

  const underMatch = lower.match(
    /(?:under|below|less than|upto|up to)\s*(?:â‚¹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i
  );
  if (underMatch) maxPrice = Number(underMatch[1]);

  const overMatch = lower.match(
    /(?:over|above|more than|greater than)\s*(?:â‚¹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i
  );
  if (overMatch) minPrice = Number(overMatch[1]);

  if (/(discount|off)\b/.test(lower)) {
    const percentMatch = lower.match(/(\d{1,3})\s*%/);
    const percentWord = lower.match(/(\d{1,3})\s*percent/);
    const value = percentMatch ? percentMatch[1] : percentWord ? percentWord[1] : null;
    if (value) {
      const parsed = Math.min(100, Math.max(0, Number(value)));
      if (!Number.isNaN(parsed)) discountPercent = parsed;
      discountExact = true;
    }
  }

  const sizes = new Set();
  const sizeMatch = lower.match(/\bsize\s*[:=]?\s*([a-z0-9]+)/i);
  if (sizeMatch) {
    const normalized = normalizeSize(sizeMatch[1]);
    if (normalized) sizes.add(normalized);
  }
  const sizeTokens = lower.match(/\b(xs|s|m|l|xl|xxl|xxxl|free|fs|one)\b/g);
  (sizeTokens || []).forEach((token) => {
    const normalized = normalizeSize(token);
    if (normalized) sizes.add(normalized);
  });

  const colorNames = findColorNamesInQuery(lower);
  const colorHexes = extractHexes(lower);

  const tokens = lower.split(/[^a-z0-9#%]+/).filter(Boolean);
  const stopwords = new Set([
    "under",
    "below",
    "less",
    "than",
    "upto",
    "up",
    "to",
    "over",
    "above",
    "more",
    "greater",
    "between",
    "from",
    "and",
    "discount",
    "off",
    "percent",
    "price",
    "rs",
    "inr",
    "size",
  ]);
  colorNames.forEach((c) => stopwords.add(c));
  Array.from(sizes).forEach((s) => stopwords.add(s.toLowerCase()));

  const textTokens = tokens.filter((t) => !stopwords.has(t) && !/^\d+%?$/.test(t));

  return {
    textTokens,
    minPrice,
    maxPrice,
    discountPercent,
    discountExact,
    sizes: Array.from(sizes),
    colorNames,
    colorHexes,
  };
};

export const buildProductSearchFilter = (input = "", options = {}) => {
  const rawQuery = input.toString().trim();
  const parsed = options.parsed || parseSearchQuery(input);
  const categoryTokenMap = options.categoryTokenMap || new Map();
  const fallbackCategoryIds = options.fallbackCategoryIds || [];
  const and = [];

  if (parsed.textTokens.length) {
    const tokenConditions = parsed.textTokens.map((token) => {
      const regex = buildTokenRegex(token);
      if (!regex) return null;
      const or = [
        { name: regex },
        { title: regex },
        { description: regex },
        { "key_highlights.key": regex },
        { "key_highlights.value": regex },
        { "specifications.key": regex },
        { "specifications.value": regex },
      ];
      const catIds = categoryTokenMap.get(token);
      if (catIds?.length) {
        or.push({ catagory_id: { $in: catIds } });
      }
      return { $or: or };
    }).filter(Boolean);
    if (tokenConditions.length) {
      and.push({ $and: tokenConditions });
    }
  }

  if (parsed.colorHexes.length) {
    and.push({
      $or: [
        { colors: { $in: parsed.colorHexes } },
        { "colorVariants.color": { $in: parsed.colorHexes } },
      ],
    });
  }

  if (parsed.sizes.length) {
    const sizeRegex = new RegExp(parsed.sizes.map(escapeRegex).join("|"), "i");
    and.push({
      $or: [
        { sizes: { $in: parsed.sizes } },
        { sizes: { $regex: sizeRegex } },
        { "colorVariants.sizes.label": { $in: parsed.sizes } },
        { "colorVariants.sizes.label": { $regex: sizeRegex } },
      ],
    });
  }

  if (parsed.minPrice !== null || parsed.maxPrice !== null) {
    const priceExprs = [];
    const effectivePrice = {
      $cond: [{ $gt: ["$selling_price", 0] }, "$selling_price", "$price"],
    };
    if (parsed.minPrice !== null) priceExprs.push({ $gte: [effectivePrice, parsed.minPrice] });
    if (parsed.maxPrice !== null) priceExprs.push({ $lte: [effectivePrice, parsed.maxPrice] });

    const priceCond = {};
    if (parsed.minPrice !== null) priceCond.$gte = parsed.minPrice;
    if (parsed.maxPrice !== null) priceCond.$lte = parsed.maxPrice;

    and.push({
      $or: [
        { $expr: { $and: priceExprs } },
        { "colorVariants.price": priceCond },
        { "colorVariants.discountedPrice": priceCond },
      ],
    });
  }

  if (parsed.discountPercent !== null) {
    const sellingExpr = { $ifNull: ["$selling_price", "$price"] };
    const discountExpr = {
      $cond: [
        { $gt: ["$price", 0] },
        {
          $multiply: [
            { $divide: [{ $subtract: ["$price", sellingExpr] }, "$price"] },
            100,
          ],
        },
        0,
      ],
    };
    if (parsed.discountExact) {
      and.push({
        $expr: {
          $and: [
            { $gte: [discountExpr, parsed.discountPercent] },
            { $lt: [discountExpr, parsed.discountPercent + 1] },
          ],
        },
      });
    } else {
      and.push({ $expr: { $gte: [discountExpr, parsed.discountPercent] } });
    }
  }

  if (!and.length && rawQuery) {
    const fallback = new RegExp(escapeRegex(rawQuery), "i");
    const or = [
      { name: fallback },
      { title: fallback },
      { description: fallback },
      { "key_highlights.key": fallback },
      { "key_highlights.value": fallback },
      { "specifications.key": fallback },
      { "specifications.value": fallback },
      { colors: { $regex: fallback } },
      { "colorVariants.color": { $regex: fallback } },
    ];
    if (fallbackCategoryIds.length) {
      or.push({ catagory_id: { $in: fallbackCategoryIds } });
    }
    and.push({ $or: or });
  }

  return { filter: and.length ? { $and: and } : {}, parsed };
};
