import StoreSetting from "../../model/storeSetting.model.js";

const publicSettings = (settings) => ({
  storeName: settings?.storeName || "Pure Fire",
  supportEmail: settings?.supportEmail || "support@purefire.com",
  supportPhone: settings?.supportPhone || "+91 79053 25078",
  address: settings?.address || "India",
  socialLinks: settings?.socialLinks || {},
  seo: settings?.seo || {},
});

export const getSettings = async (_req, res) => {
  const settings = await StoreSetting.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true }
  ).lean();
  return res.json({ status: true, data: settings });
};

export const getPublicSettings = async (_req, res) => {
  const settings = await StoreSetting.findOne({ key: "default" }).lean();
  return res.json({ status: true, data: publicSettings(settings) });
};

export const updateSettings = async (req, res) => {
  const payload = {
    storeName: String(req.body?.storeName || "").trim(),
    supportEmail: String(req.body?.supportEmail || "").trim().toLowerCase(),
    supportPhone: String(req.body?.supportPhone || "").trim(),
    address: String(req.body?.address || "").trim(),
    gstin: String(req.body?.gstin || req.body?.gstNumber || "").trim(),
    gstNumber: String(req.body?.gstNumber || req.body?.gstin || "").trim(),
    gstPercentage:
      req.body?.gstPercentage === "" || req.body?.gstPercentage === null || req.body?.gstPercentage === undefined
        ? null
        : Number(req.body.gstPercentage),
    socialLinks: req.body?.socialLinks || {},
    seo: req.body?.seo || {},
    shipping: req.body?.shipping || {},
  };
  if (!payload.storeName) {
    return res.status(400).json({ status: false, message: "Store name is required" });
  }
  if (payload.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.supportEmail)) {
    return res.status(400).json({ status: false, message: "Support email is invalid" });
  }
  if (payload.gstPercentage !== null && (!Number.isFinite(payload.gstPercentage) || payload.gstPercentage < 0)) {
    return res.status(400).json({ status: false, message: "GST percentage must be numeric and >= 0" });
  }
  const settings = await StoreSetting.findOneAndUpdate(
    { key: "default" },
    { $set: payload, $setOnInsert: { key: "default" } },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  return res.json({ status: true, data: settings });
};
