import mongoose from "mongoose";

const StoreSettingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "default" },
    storeName: { type: String, default: "Pure Fire" },
    supportEmail: { type: String, default: "" },
    supportPhone: { type: String, default: "" },
    address: { type: String, default: "" },
    gstNumber: { type: String, default: "" },
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
  },
  { timestamps: true }
);

const StoreSetting = mongoose.model("StoreSetting", StoreSettingSchema);
export default StoreSetting;
