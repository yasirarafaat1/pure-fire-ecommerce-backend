import mongoose from "mongoose";
import OrderItemSchema from "./orderItem.model.js";

const OrdersSchema = new mongoose.Schema(
  {
    order_id: { type: Number, unique: true, index: true },
    status: { type: String, default: "pending" },
    payment_status: { type: String, default: "pending" },
    payment_method: { type: String, default: "Payoneer" },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    promo_code: { type: String, default: "" },
    promo_discount: { type: Number, default: 0 },
    promo_snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_signature: { type: String },
    payu_payment_id: { type: String },
    items: { type: [OrderItemSchema], default: [] },
    address: { type: mongoose.Schema.Types.ObjectId, ref: "Addresses" },
    user_email: { type: String },
    FullName: { type: String },
    phone1: { type: String },
    phone2: { type: String },
    address_line1: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    pinCode: { type: String },
    addressType: { type: String },
    delivery_provider: { type: String, default: "Shiprocket" },
    shiprocket_order_id: { type: Number },
    shiprocket_shipment_id: { type: Number },
    shiprocket_awb: { type: String },
    courier_company_id: { type: Number },
    courier_name: { type: String },
    courier_rate: { type: Number },
    courier_etd: { type: Number },
    shiprocket_error: { type: String },
    tracking_number: { type: String, default: "" },
    tracking_url: { type: String, default: "" },
    shippedAt: { type: Date, default: null },
    stockConfirmedAt: { type: Date, default: null },
    restockedAt: { type: Date, default: null },
    admin_notes: { type: String, default: "" },
    cancellation_reason: { type: String, default: "" },
    return_reason: { type: String, default: "" },
    refund_status: {
      type: String,
      enum: ["", "PENDING", "PROCESSED", "FAILED"],
      default: "",
    },
    refund_amount: { type: Number, default: 0 },
    timeline: {
      type: [
        {
          status: { type: String, required: true },
          note: { type: String, default: "" },
          adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const Orders = mongoose.model("Orders", OrdersSchema);
export default Orders;
