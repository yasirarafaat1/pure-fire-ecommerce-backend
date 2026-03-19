import mongoose from "mongoose";

const SpecificationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const HighlightSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    product_id: { type: Number, unique: true, index: true },
    title: String,
    sku: { type: String, trim: true },
    name: { type: String, required: true },
    price: {
      type: Number,
      required: function () {
        return this.status === "published";
      },
    },
    selling_price: {
      type: Number,
      required: function () {
        return this.status === "published";
      },
    },
    description: String,
    key_highlights: { type: [HighlightSchema], default: [] },
    selling_price_link: { type: String },
    product_image: { type: [String], default: [] }, // array of image URLs
    image_public_ids: { type: [String], default: [] },
    video_url: { type: String, default: "" },
    video_public_id: { type: String, default: "" },
    quantity: {
      type: Number,
      default: 0,
      required: function () {
        return this.status === "published";
      },
    },
    catagory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Catagories",
      required: true,
    },
    specifications: { type: [SpecificationSchema], default: [] },
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
    status: {
      type: String,
      enum: ["draft", "published", "unpublished", "cancelled"],
      default: "draft",
    },
  draft_stage: {
    type: String,
    enum: ["category", "details", "media", "pricing", "variants", "complete"],
    default: "details",
  },
  },
  { timestamps: true }
);

export const Products = mongoose.model("Products", ProductSchema);
export default Products;
