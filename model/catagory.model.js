import mongoose from "mongoose";

const CatagorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Catagories",
      default: null,
    },
    // stores the full chain of ancestors to allow quick subtree queries
    ancestors: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "Catagories" },
        name: { type: String, required: true },
      },
    ],
    slug: { type: String, trim: true, index: true },
    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    sortOrder: { type: Number, default: 0 },
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
  },
  { timestamps: true }
);

// enforce uniqueness per parent (name can repeat in different branches)
CatagorySchema.index({ name: 1, parent: 1 }, { unique: true });

export const Catagories = mongoose.model("Catagories", CatagorySchema);
export default Catagories;
