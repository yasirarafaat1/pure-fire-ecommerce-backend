import Orders from "../../model/orders.model.js";
import Products from "../../model/product.model.js";

const normalize = (status) => String(status || "PENDING").trim().toUpperCase();

const TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURN_APPROVED", "RETURN_REJECTED"],
  RETURN_APPROVED: ["REFUNDED", "REPLACED"],
  RETURN_REJECTED: [],
  CANCELLED: [],
  REFUNDED: [],
  REPLACED: [],
};

const decrementStock = async (order) => {
  const changed = [];
  for (const item of order.items) {
    const result = await Products.updateOne(
      {
        product_id: Number(item.product_id),
        quantity: { $gte: Number(item.quantity) },
      },
      { $inc: { quantity: -Number(item.quantity) } }
    );
    if (!result.modifiedCount) {
      await Promise.all(
        changed.map((entry) =>
          Products.updateOne(
            { product_id: entry.productId },
            { $inc: { quantity: entry.quantity } }
          )
        )
      );
      throw new Error(`Insufficient stock for product ${item.product_id}`);
    }
    changed.push({ productId: Number(item.product_id), quantity: Number(item.quantity) });
  }
};

const restock = async (order) => {
  if (order.restockedAt) return false;
  await Promise.all(
    order.items.map((item) =>
      Products.updateOne(
        { product_id: Number(item.product_id) },
        { $inc: { quantity: Number(item.quantity) } }
      )
    )
  );
  order.restockedAt = new Date();
  return true;
};

export const transitionOrder = async ({
  orderId,
  nextStatus,
  adminId,
  note = "",
  refundAmount,
}) => {
  const order = await Orders.findOne({
    $or: [
      { order_id: Number(orderId) || -1 },
      ...(String(orderId).match(/^[a-f\d]{24}$/i) ? [{ _id: orderId }] : []),
    ],
  });
  if (!order) {
    const error = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  const current = normalize(order.status);
  const next = normalize(nextStatus);
  if (current === next) {
    return { order, changed: false, message: `Order is already ${next}` };
  }
  if (!(TRANSITIONS[current] || []).includes(next)) {
    const error = new Error(`Invalid transition from ${current} to ${next}`);
    error.statusCode = 409;
    throw error;
  }

  if (next === "CONFIRMED" && !order.stockConfirmedAt) {
    await decrementStock(order);
    order.stockConfirmedAt = new Date();
    order.payment_status = order.payment_status || "paid";
  }
  if (next === "RETURN_APPROVED" || (next === "CANCELLED" && order.stockConfirmedAt)) {
    await restock(order);
  }
  if (next === "SHIPPED" && !order.shippedAt) order.shippedAt = new Date();
  if (next === "REFUNDED") {
    order.refund_status = "PROCESSED";
    order.refund_amount = Number(refundAmount) || Number(order.amount) || 0;
  }

  order.status = next;
  order.timeline.push({
    status: next,
    note: String(note || "").trim(),
    adminId,
    createdAt: new Date(),
  });
  await order.save();
  return { order, changed: true, message: `Order moved to ${next}` };
};

export const allowedOrderTransitions = (status) => TRANSITIONS[normalize(status)] || [];
