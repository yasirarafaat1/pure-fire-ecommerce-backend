import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    imageUrl: { type: String, required: true, trim: true },
    imagePublicId: { type: String, trim: true },
    targetUrl: { type: String, required: true, trim: true },
    width: { type: Number, default: 1200 },
    height: { type: Number, default: 675 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bannerSchema.index({ order: 1, createdAt: -1 });

const Banner = mongoose.model("Banner", bannerSchema);

export default Banner;
export { Banner };
