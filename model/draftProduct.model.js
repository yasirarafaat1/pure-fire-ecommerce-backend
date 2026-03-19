import mongoose from "mongoose";

const HighlightSchema = new mongoose.Schema(
  { key: String, value: String },
  { _id: false }
);

const SpecificationSchema = new mongoose.Schema(
  { key: String, value: String },
  { _id: false }
);

const DraftProductSchema = new mongoose.Schema(
  {
    draft_id: { type: Number, unique: true, index: true },
    product_id: { type: Number }, // keep reference if already published later
    title: String,
    sku: { type: String, trim: true },
    name: { type: String },
    price: { type: Number },
    selling_price: { type: Number },
    description: String,
    selling_price_link: { type: String },
    product_image: { type: [String], default: [] },
    image_public_ids: { type: [String], default: [] },
    video_url: { type: String, default: "" },
    video_public_id: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    catagory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Catagories",
    },
    specifications: { type: [SpecificationSchema], default: [] },
    key_highlights: { type: [HighlightSchema], default: [] },
    colors: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
    colorVariants: {
      type: [
        {
          color: { type: String, required: true },
          images: { type: [String], default: [] },
          video: { type: String, default: "" },
          price: { type: Number },
          discountedPrice: { type: Number },
          sizes: {
            type: [
              {
                label: { type: String, required: true },
                stock: { type: Number, default: 0 },
              },
            ],
            default: [],
          },
          primary: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    status: { type: String, default: "draft" },
    draft_stage: {
      type: String,
      enum: ["category", "details", "media", "pricing", "variants", "complete"],
      default: "category",
    },
  },
  { timestamps: true }
);

export const DraftProducts = mongoose.model("DraftProducts", DraftProductSchema);
export default DraftProducts;
