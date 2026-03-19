import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true },
    color: { type: String, default: "" },
    size: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    price: { type: Number, required: true },
    mrp: { type: Number, required: true },
    title: { type: String, required: true },
    image: { type: String, default: "" },
  },
  { _id: false },
);

const CartSchema = new mongoose.Schema(
  {
    cart_id: { type: String, required: true, unique: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true },
);

const Cart = mongoose.model("Cart", CartSchema);
export default Cart;
