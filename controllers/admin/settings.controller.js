import StoreSetting from "../../model/storeSetting.model.js";
import { uploadToCloudinary } from "../../config/cloudinary.js";
import {
  syncInstagramReels,
  testInstagramConnection,
} from "../../services/instagramReels.service.js";
import {
  syncAllToGoogleSheets,
  testGoogleSheetsConnection,
} from "../../services/googleSheetsSync.service.js";

const SECRET_MASK = "********";

const publicInstagramReels = (settings) => ({
  enabled: Boolean(settings?.instagramReels?.enabled),
  handle: settings?.instagramReels?.handle || "",
});

const maskAdminSettings = (settings) => {
  if (!settings) return settings;
  return {
    ...settings,
    instagramReels: {
      ...(settings.instagramReels || {}),
      accessToken: settings.instagramReels?.accessToken ? SECRET_MASK : "",
      metaAppSecret: settings.instagramReels?.metaAppSecret ? SECRET_MASK : "",
    },
    googleSheets: {
      ...(settings.googleSheets || {}),
      secret: settings.googleSheets?.secret ? SECRET_MASK : "",
    },
  };
};

const publicSettings = (settings) => ({
  storeName: settings?.storeName || "Pure Fire",
  supportEmail: settings?.supportEmail || "support@purefire.com",
  supportPhone: settings?.supportPhone || "+91 79053 25078",
  address: settings?.address || "India",
  socialLinks: settings?.socialLinks || {},
  seo: {
    logoUrl: settings?.seo?.logoUrl || "",
    faviconUrl: settings?.seo?.faviconUrl || "",
    title: settings?.seo?.title || "",
    description: settings?.seo?.description || "",
  },
  instagramReels: publicInstagramReels(settings),
});

export const getSettings = async (_req, res) => {
  const settings = await StoreSetting.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true }
  ).lean();
  return res.json({ status: true, data: maskAdminSettings(settings) });
};

export const getPublicSettings = async (_req, res) => {
  const settings = await StoreSetting.findOne({ key: "default" }).lean();
  return res.json({ status: true, data: publicSettings(settings) });
};

export const updateSettings = async (req, res) => {
  const existing = await StoreSetting.findOne({ key: "default" }).lean();
  const incomingInstagram = req.body?.instagramReels || {};
  const existingInstagram = existing?.instagramReels || {};
  const incomingGoogleSheets = req.body?.googleSheets || {};
  const existingGoogleSheets = existing?.googleSheets || {};
  const accessToken =
    incomingInstagram.accessToken === SECRET_MASK
      ? existingInstagram.accessToken || ""
      : String(incomingInstagram.accessToken || "").trim();
  const metaAppSecret =
    incomingInstagram.metaAppSecret === SECRET_MASK
      ? existingInstagram.metaAppSecret || ""
      : String(incomingInstagram.metaAppSecret || "").trim();
  const googleSheetsSecret =
    incomingGoogleSheets.secret === SECRET_MASK
      ? existingGoogleSheets.secret || ""
      : String(incomingGoogleSheets.secret || "").trim();
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
    instagramReels: {
      enabled: Boolean(incomingInstagram.enabled),
      handle: String(incomingInstagram.handle || "").trim().replace(/^@+/, ""),
      igUserId: String(incomingInstagram.igUserId || "").trim(),
      pageId: String(incomingInstagram.pageId || "").trim(),
      accessToken,
      tokenExpiresAt: String(incomingInstagram.tokenExpiresAt || "").trim(),
      metaAppId: String(incomingInstagram.metaAppId || "").trim(),
      metaAppSecret,
      lastSyncedAt: existingInstagram.lastSyncedAt || null,
      lastSyncStatus: existingInstagram.lastSyncStatus || "",
      lastSyncError: existingInstagram.lastSyncError || "",
    },
    googleSheets: {
      enabled: Boolean(incomingGoogleSheets.enabled),
      appScriptUrl: String(incomingGoogleSheets.appScriptUrl || "").trim(),
      secret: googleSheetsSecret,
      spreadsheetId: String(incomingGoogleSheets.spreadsheetId || "").trim(),
      productsTabName: String(incomingGoogleSheets.productsTabName || "Products").trim() || "Products",
      ordersTabName: String(incomingGoogleSheets.ordersTabName || "Orders").trim() || "Orders",
      lastSyncedAt: existingGoogleSheets.lastSyncedAt || null,
      lastSyncStatus: existingGoogleSheets.lastSyncStatus || "",
      lastSyncError: existingGoogleSheets.lastSyncError || "",
      lastSyncStats: existingGoogleSheets.lastSyncStats || { products: 0, orders: 0 },
      lastConnectedAt: existingGoogleSheets.lastConnectedAt || null,
    },
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
  return res.json({ status: true, data: maskAdminSettings(settings) });
};

export const uploadLogo = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ status: false, success: false, message: "Logo file is required" });
    }
    const uploadRes = await uploadToCloudinary(
      req.file.buffer,
      `store-logo-${Date.now()}`,
      req.file.mimetype
    );
    const logoUrl = uploadRes.secure_url || uploadRes.url || "";
    if (!logoUrl) {
      return res.status(500).json({ status: false, success: false, message: "Logo upload failed" });
    }
    await StoreSetting.findOneAndUpdate(
      { key: "default" },
      { $set: { "seo.logoUrl": logoUrl }, $setOnInsert: { key: "default" } },
      { upsert: true, new: true }
    );
    return res.json({ status: true, success: true, logoUrl });
  } catch (error) {
    console.error("uploadLogo error:", error);
    return res.status(500).json({ status: false, success: false, message: error.message || "Logo upload failed" });
  }
};

export const testInstagram = async (_req, res) => {
  const result = await testInstagramConnection();
  return res.json({ status: true, data: result, message: "Instagram connection successful" });
};

export const syncInstagram = async (_req, res) => {
  const result = await syncInstagramReels();
  return res.json({ status: true, data: result, message: `Instagram reels synced: ${result.synced}` });
};

export const testGoogleSheets = async (_req, res) => {
  const result = await testGoogleSheetsConnection();
  return res.json({ status: true, data: result, message: "Google Sheets connection successful" });
};

export const syncGoogleSheets = async (_req, res) => {
  const result = await syncAllToGoogleSheets();
  return res.json({
    status: true,
    data: result,
    message: `Google Sheets synced: ${result.products} products, ${result.orders} orders`,
  });
};
