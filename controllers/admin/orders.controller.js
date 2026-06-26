import Orders from "../../model/orders.model.js";
import {
  dateRangeFilter,
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";
import {
  allowedOrderTransitions,
  transitionOrder,
} from "../../services/admin/orderTransition.service.js";
import { ensureInvoiceForDeliveredOrder } from "../../services/invoice.service.js";
import { writeAdminAudit } from "../../utils/adminAudit.js";

const orderFilter = (query) => {
  const filter = { ...dateRangeFilter(query) };
  if (query.status) filter.status = new RegExp(`^${escapeRegex(query.status)}$`, "i");
  if (query.paymentStatus) {
    filter.payment_status = new RegExp(`^${escapeRegex(query.paymentStatus)}$`, "i");
  }
  if (query.shippingStatus) {
    filter.status = new RegExp(escapeRegex(query.shippingStatus), "i");
  }
  const q = String(query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { FullName: regex },
      { user_email: regex },
      { phone1: regex },
      ...(Number.isFinite(Number(q)) ? [{ order_id: Number(q) }] : []),
    ];
  }
  return filter;
};

export const listOrders = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = orderFilter(req.query);
  const [data, total] = await Promise.all([
    Orders.find(filter)
      .populate("items.product", "name title product_image sku")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Orders.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const getOrder = async (req, res) => {
  const id = req.params.id;
  const order = await Orders.findOne({
    $or: [
      { order_id: Number(id) || -1 },
      ...(String(id).match(/^[a-f\d]{24}$/i) ? [{ _id: id }] : []),
    ],
  })
    .populate("items.product", "name title product_image sku price selling_price")
    .populate("address")
    .populate("timeline.adminId", "name email")
    .lean();
  if (!order) return res.status(404).json({ status: false, message: "Order not found" });
  return res.json({
    status: true,
    data: order,
    allowedTransitions: allowedOrderTransitions(order.status),
  });
};

export const updateOrderStatus = async (req, res) => {
  try {
    const result = await transitionOrder({
      orderId: req.params.id,
      nextStatus: req.body?.status,
      adminId: req.admin._id,
      note: req.body?.note,
      refundAmount: req.body?.refundAmount,
    });
    if (result.changed) {
      await writeAdminAudit(req, {
        action: "ORDER_STATUS_UPDATED",
        entityType: "ORDER",
        entityId: result.order.order_id || result.order._id,
        metadata: { status: result.order.status, note: req.body?.note || "" },
      });
    }
    if (String(result.order.status || "").toUpperCase() === "DELIVERED") {
      try {
        await ensureInvoiceForDeliveredOrder(result.order._id);
      } catch (invoiceError) {
        console.error("Invoice creation failed for delivered order:", {
          orderId: result.order._id,
          orderNumber: result.order.order_id,
          message: invoiceError.message,
        });
        return res.status(invoiceError.statusCode || 500).json({
          status: false,
          message: invoiceError.message || "Order delivered but invoice could not be created",
        });
      }
    }
    return res.json({
      status: true,
      message: result.message,
      data: result.order,
      allowedTransitions: allowedOrderTransitions(result.order.status),
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ status: false, message: error.message });
  }
};

export const updateShipping = async (req, res) => {
  const allowed = ["courier_name", "tracking_number", "tracking_url", "admin_notes"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body?.[key] !== undefined) update[key] = String(req.body[key] || "").trim();
  });
  const order = await Orders.findOneAndUpdate(
    { order_id: Number(req.params.id) },
    update,
    { new: true, runValidators: true }
  ).lean();
  if (!order) return res.status(404).json({ status: false, message: "Order not found" });
  await writeAdminAudit(req, {
    action: "ORDER_SHIPPING_UPDATED",
    entityType: "ORDER",
    entityId: order.order_id,
    metadata: update,
  });
  return res.json({ status: true, data: order });
};
