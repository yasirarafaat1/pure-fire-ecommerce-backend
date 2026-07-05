import mongoose from "mongoose";

const StoreSettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "default" },
    storeName: { type: String, default: "Pure Fire" },
    supportEmail: { type: String, default: "" },
    supportPhone: { type: String, default: "" },
    address: { type: String, default: "" },
    gstin: { type: String, default: "" },
    gstNumber: { type: String, default: "" },
    gstPercentage: { type: Number, default: null, min: 0 },
    socialLinks: {
      instagram: { type: String, default: "" },
      facebook: { type: String, default: "" },
      youtube: { type: String, default: "" },
      twitter: { type: String, default: "" },
    },
    seo: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      logoUrl: { type: String, default: "" },
      faviconUrl: { type: String, default: "" },
    },
    shipping: {
      defaultCourier: { type: String, default: "" },
      freeShippingThreshold: { type: Number, default: 0 },
    },
    instagramReels: {
      enabled: { type: Boolean, default: false },
      handle: { type: String, default: "" },
      igUserId: { type: String, default: "" },
      pageId: { type: String, default: "" },
      accessToken: { type: String, default: "" },
      tokenExpiresAt: { type: String, default: "" },
      metaAppId: { type: String, default: "" },
      metaAppSecret: { type: String, default: "" },
      lastSyncedAt: { type: Date, default: null },
      lastSyncStatus: { type: String, default: "" },
      lastSyncError: { type: String, default: "" },
    },
    googleSheets: {
      enabled: { type: Boolean, default: false },
      appScriptUrl: { type: String, default: "" },
      secret: { type: String, default: "" },
      spreadsheetId: { type: String, default: "" },
      productsTabName: { type: String, default: "Products" },
      ordersTabName: { type: String, default: "Orders" },
      lastSyncedAt: { type: Date, default: null },
      lastSyncStatus: { type: String, default: "" },
      lastSyncError: { type: String, default: "" },
      lastSyncStats: {
        products: { type: Number, default: 0 },
        orders: { type: Number, default: 0 },
      },
      lastConnectedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const StoreSetting = mongoose.model("StoreSetting", StoreSettingSchema);
export default StoreSetting;
