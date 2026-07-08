import mongoose from "mongoose";

const navStripSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    textHtml: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },
    hoverText: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    href: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    durationSeconds: {
      type: Number,
      min: 1,
      max: 10,
      default: 4,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true },
);

navStripSchema.index({ isActive: 1, order: 1, createdAt: -1 });

const NavStrip = mongoose.model("NavStrip", navStripSchema);

export default NavStrip;
export { NavStrip };
