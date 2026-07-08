import mongoose from "mongoose";

const sizeGuideTableSchema = new mongoose.Schema(
  {
    headers: {
      type: [String],
      default: [],
      validate: {
        validator: (value) => value.length <= 8,
        message: "A size table can have up to 8 columns.",
      },
    },
    rows: {
      type: [[String]],
      default: [],
      validate: {
        validator: (value) => value.length <= 30,
        message: "A size table can have up to 30 rows.",
      },
    },
  },
  { _id: false },
);

const sizeGuideSectionSchema = new mongoose.Schema(
  {
    heading: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    body: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },
    table: {
      type: sizeGuideTableSchema,
      default: () => ({ headers: [], rows: [] }),
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: false },
);

const sizeGuideSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: "default",
      immutable: true,
    },
    title: {
      type: String,
      trim: true,
      default: "Size Guide",
      maxlength: 120,
    },
    intro: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    sections: {
      type: [sizeGuideSectionSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= 20,
        message: "Size guide can have up to 20 sections.",
      },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

const SizeGuide = mongoose.model("SizeGuide", sizeGuideSchema);

export default SizeGuide;
export { SizeGuide };
