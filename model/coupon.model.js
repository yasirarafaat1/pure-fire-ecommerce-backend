import mongoose from "mongoose";

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: "", trim: true },
    discountType: { type: String, enum: ["PERCENTAGE", "FIXED"], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minimumOrderAmount: { type: Number, default: 0, min: 0 },
    minimumQuantity: { type: Number, default: 1, min: 1 },
    maxDiscountAmount: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    target: {
      scope: {
        type: String,
        enum: ["ALL_PRODUCTS", "SELECTED_PRODUCTS", "SELECTED_CATEGORIES"],
        default: "ALL_PRODUCTS",
        index: true,
      },
      productIds: { type: [Number], default: [] },
      categoryIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Catagories", default: [] },
    },
    timer: {
      enabled: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ["FIXED_WINDOW", "ONE_TIME", "LOOP"],
        default: "FIXED_WINDOW",
      },
      startAt: { type: Date, default: null },
      endAt: { type: Date, default: null },
      durationMinutes: { type: Number, default: 0, min: 0 },
    },
    status: { type: String, enum: ["ACTIVE", "DISABLED"], default: "ACTIVE", index: true },
  },
  { timestamps: true }
);

const Coupon = mongoose.model("Coupon", CouponSchema);
export default Coupon;
