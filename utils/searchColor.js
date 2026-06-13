import namer from "color-namer";
import { colornames } from "color-name-list";

const SIZE_ALIASES = {
  small: "S",
  medium: "M",
  large: "L",
  "extra large": "XL",
  "extra-large": "XL",
  "extra small": "XS",
  "extra-small": "XS",
  "double extra large": "XXL",
  "double-extra-large": "XXL",
  "triple extra large": "XXXL",
  "triple-extra-large": "XXXL",
  free: "FREE",
  fs: "FREE",
  one: "ONE",
  "one size": "ONE",
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeHex = (value) => {
  const raw = value.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{3,6}$/.test(raw)) return null;
  const hex = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return hex.toLowerCase();
};

const COLOR_ENTRIES = (Array.isArray(colornames) ? colornames : [])
  .map((c) => ({
    name: String(c.name || "").toLowerCase().trim(),
    hex: normalizeHex(String(c.hex || "")),
  }))
  .filter((c) => c.name && c.hex);

export const normalizeSize = (value) => {
  if (!value) return null;
  const raw = value.toString().trim().toLowerCase();
  if (SIZE_ALIASES[raw]) return SIZE_ALIASES[raw];
  if (/^(xs|s|m|l|xl|xxl|xxxl|one|free)$/.test(raw)) return raw.toUpperCase();
  if (/^\d{2,3}$/.test(raw)) return raw;
  return null;
};

export const findColorNamesInQuery = (lower) => {
  const found = [];
  COLOR_ENTRIES.forEach((c) => {
    if (c.name.length <= 2) return;
    if (c.name.includes(" ")) {
      if (lower.includes(c.name)) found.push(c.name);
      return;
    }
    const re = new RegExp(`\\b${escapeRegex(c.name)}\\b`, "i");
    if (re.test(lower)) found.push(c.name);
  });
  const unique = Array.from(new Set(found));
  unique.sort((a, b) => b.length - a.length);
  return unique;
};

export const extractHexes = (lower) => {
  const matches = lower.match(/#([0-9a-f]{3,6})/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((m) => normalizeHex(m))
        .filter(Boolean)
        .map((h) => [h, `#${h}`])
        .flat()
    )
  );
};

const nameMatches = (label, desired) => desired.some((n) => label.includes(n));

const getProductColorCandidates = (product) =>
  []
    .concat(product?.colors || [])
    .concat((product?.colorVariants || []).map((v) => v.color))
    .filter(Boolean)
    .map((c) => String(c).trim());

const matchesHex = (label, hexes) => {
  const candHex = normalizeHex(label);
  if (!candHex) return false;
  return hexes.some((h) => normalizeHex(h) === candHex);
};

const matchesColorName = (label, desiredNames) => {
  const lower = label.toLowerCase();
  if (nameMatches(lower, desiredNames)) return true;
  const hex = normalizeHex(lower);
  if (!hex) return false;
  const named = namer(`#${hex}`);
  const palettes = ["basic", "html", "ntc", "pantone", "xkcd"];
  const hits = palettes
    .map((pName) => named[pName] || [])
    .flat()
    .map((n) => String(n.name || "").toLowerCase());
  return hits.some((h) => nameMatches(h, desiredNames));
};

export const pickMatchedColor = (product, colorNames = [], colorHexes = []) => {
  const desiredNames = colorNames.map((c) => c.toLowerCase());
  const candidates = getProductColorCandidates(product);
  if (colorHexes.length) {
    const hit = candidates.find((c) => matchesHex(c, colorHexes));
    if (hit) return hit;
  }
  if (desiredNames.length) {
    const hit = candidates.find((c) => matchesColorName(c, desiredNames));
    if (hit) return hit;
  }
  return "";
};

export const filterProductsByColorName = (products = [], colorNames = [], colorHexes = []) => {
  if (!colorNames.length && !colorHexes.length) return products;
  const desired = colorNames.map((c) => c.toLowerCase());

  return products.filter((p) => {
    const candidates = getProductColorCandidates(p);
    for (const c of candidates) {
      if (colorHexes.length && matchesHex(c, colorHexes)) return true;
      if (desired.length && matchesColorName(c, desired)) return true;
    }
    return false;
  });
};

