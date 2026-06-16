import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    color: { type: String },
    size: { type: String },
  },
  { _id: false }
);

export default OrderItemSchema;
