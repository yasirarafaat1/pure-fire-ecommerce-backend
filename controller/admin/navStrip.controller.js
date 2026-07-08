import NavStrip from "../../model/navStrip.model.js";
import NavStripSetting from "../../model/navStripSetting.model.js";

const MAX_TEXT_LENGTH = 120;
const MAX_HREF_LENGTH = 500;
const MAX_HTML_LENGTH = 3000;

const stripTags = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const sanitizeHref = (value) => {
  const href = String(value || "").trim();
  if (!href) return "";
  if (href.startsWith("/") || /^https?:\/\//i.test(href)) return href;
  return "";
};

const sanitizeNavStripHtml = (value) => {
  let html = String(value || "").slice(0, MAX_HTML_LENGTH);

  html = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\S+/gi, "")
    .replace(/javascript:/gi, "");

  html = html.replace(/<(?!\/?(?:b|strong|i|em|u|span|a|br)\b)[^>]*>/gi, "");

  html = html.replace(/<a\b([^>]*)>/gi, (_match, attrs) => {
    const hrefMatch = String(attrs || "").match(/\shref=(["'])(.*?)\1/i);
    const colorMatch = String(attrs || "").match(/--hover-color:\s*(#[0-9a-f]{3,8})/i);
    const href = sanitizeHref(hrefMatch?.[2] || "");
    const color = colorMatch?.[1] || "";
    const colorAttrs = color ? ` data-hover-color="true" style="--hover-color:${color}"` : "";
    return href ? `<a href="${href}"${colorAttrs}>` : "<a>";
  });

  html = html.replace(/<span\b([^>]*)>/gi, (_match, attrs) => {
    const colorMatch = String(attrs || "").match(/--hover-color:\s*(#[0-9a-f]{3,8})/i);
    const color = colorMatch?.[1] || "";
    return color ? `<span data-hover-color="true" style="--hover-color:${color}">` : "<span>";
  });

  return html.trim();
};

const clampDuration = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(10, Math.max(1, Math.round(parsed)));
};

const normalizePayload = (payload = {}) => ({
  text: String(payload.text || "").trim(),
  textHtml: sanitizeNavStripHtml(payload.textHtml),
  hoverText: String(payload.hoverText || "").trim(),
  href: String(payload.href || "").trim(),
  isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : 0,
});

const validatePayload = (payload) => {
  if (!payload.text) return "Nav strip text is required.";
  if (payload.text.length > MAX_TEXT_LENGTH) return `Text must be ${MAX_TEXT_LENGTH} characters or less.`;
  if (payload.textHtml.length > MAX_HTML_LENGTH) return `Rich text must be ${MAX_HTML_LENGTH} characters or less.`;
  if (payload.hoverText.length > MAX_TEXT_LENGTH) return `Hover text must be ${MAX_TEXT_LENGTH} characters or less.`;
  if (payload.href.length > MAX_HREF_LENGTH) return `Link must be ${MAX_HREF_LENGTH} characters or less.`;
  if (payload.href && !payload.href.startsWith("/") && !/^https?:\/\//i.test(payload.href)) {
    return "Link must start with /, http://, or https://.";
  }
  return null;
};

export const listNavStripAdmin = async (_req, res) => {
  const [items, settings] = await Promise.all([
    NavStrip.find().sort({ order: 1, createdAt: -1 }).lean(),
    NavStripSetting.findOne({ key: "default" }).lean(),
  ]);
  res.status(200).json({
    status: true,
    data: items,
    settings: { durationSeconds: clampDuration(settings?.durationSeconds) },
  });
};

export const updateNavStripSettings = async (req, res) => {
  const settings = await NavStripSetting.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        durationSeconds: clampDuration(req.body?.durationSeconds),
      },
      $setOnInsert: { key: "default" },
    },
    { new: true, upsert: true, runValidators: true },
  );

  res.status(200).json({ status: true, settings });
};

export const createNavStrip = async (req, res) => {
  const payload = normalizePayload(req.body);
  const error = validatePayload(payload);
  if (error) return res.status(400).json({ status: false, message: error });

  const item = await NavStrip.create(payload);
  res.status(201).json({ status: true, data: item });
};

export const updateNavStrip = async (req, res) => {
  const payload = normalizePayload(req.body);
  const error = validatePayload(payload);
  if (error) return res.status(400).json({ status: false, message: error });

  const item = await NavStrip.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  });

  if (!item) return res.status(404).json({ status: false, message: "Nav strip text not found." });

  res.status(200).json({ status: true, data: item });
};

export const deleteNavStrip = async (req, res) => {
  const item = await NavStrip.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ status: false, message: "Nav strip text not found." });
  res.status(200).json({ status: true, message: "Nav strip text deleted." });
};
