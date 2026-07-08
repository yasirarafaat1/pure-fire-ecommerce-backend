import mongoose from "mongoose";

const navStripSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "default",
      immutable: true,
    },
    durationSeconds: {
      type: Number,
      min: 1,
      max: 10,
      default: 4,
    },
  },
  { timestamps: true },
);

const NavStripSetting = mongoose.model("NavStripSetting", navStripSettingSchema);

export default NavStripSetting;
export { NavStripSetting };
