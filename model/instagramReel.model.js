import mongoose from "mongoose";

const InstagramReelSchema = new mongoose.Schema(
  {
    instagramMediaId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: "Instagram Reel" },
    description: { type: String, default: "" },
    videoUrl: { type: String, default: "" },
    thumbnailUrl: { type: String, default: "" },
    permalink: { type: String, default: "" },
    timestamp: { type: Date, default: null },
    username: { type: String, default: "" },
  },
  { timestamps: true }
);

const InstagramReel = mongoose.model("InstagramReel", InstagramReelSchema);
export default InstagramReel;
