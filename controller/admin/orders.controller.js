import Orders from "../../model/orders.model.js";
import Products from "../../model/product.model.js";
import { getMockOrderStatus, isShiprocketTestMode } from "../../config/shiprocket.js";
export const getOrders = async (_req, res) => {
  try {
    const data = await Orders.find({})
      .populate({ path: "items.product", select: "name title product_image price selling_price" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 });
    // return empty list instead of 404 to satisfy frontend
    const ordersWithPayment = data.map((order) => ({
      ...order.toObject(),
      payment_method: order.payment_method || "Razorpay",
    }));
    if (isShiprocketTestMode) {
      const updates = [];
      ordersWithPayment.forEach((order) => {
        const nextStatus = getMockOrderStatus(order.createdAt, order.status);
        if (nextStatus !== order.status) {
          order.status = nextStatus;
          updates.push(Orders.updateOne({ _id: order._id }, { status: nextStatus }));
        }
      });
      if (updates.length) await Promise.all(updates);
    }
    res.status(200).json({
      status: true,
      orders: ordersWithPayment,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
};
export const updateOrderStatus = async (req, res) => {
  const { status, order_id, product_id } = req.body;
  if (!status || !order_id) {
    return res
      .status(400)
      .json({ message: "Required fields missing: status or order_id." });
  }
  try {
    const order = await Orders.findOne({ order_id: Number(order_id) });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (status === "confirm") {
      if (!product_id) {
        return res
          .status(400)
          .json({ message: "product_id is required for status 'confirm'." });
      }
      const item = order.items.find(
        (i) => Number(i.product_id) === Number(product_id)
      );
      if (!item) {
        return res
          .status(404)
          .json({ message: "Product not found in this order." });
      }
      const product = await Products.findOne({
        product_id: Number(product_id),
      });
      if (!product || product.quantity < item.quantity) {
        return res
          .status(400)
          .json({ status: false, message: "Insufficient stock." });
      }
      product.quantity = product.quantity - item.quantity;
      await product.save();
      order.payment_status = "paid";
    }
    order.status = status;
    await order.save();
    return res.status(200).json({ message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ message: "Server error" });
  }
};
