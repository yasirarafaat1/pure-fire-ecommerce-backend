import mongoose from "mongoose";
import OrderItemSchema from "./orderItem.model.js";

const PendingOrderSchema = new mongoose.Schema(
  {
    razorpay_order_id: { type: String, index: true },
    items: { type: [OrderItemSchema], default: [] },
    address_id: { type: Number },
    email: { type: String },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true }
);

const PendingOrders = mongoose.model("PendingOrders", PendingOrderSchema);
export default PendingOrders;
