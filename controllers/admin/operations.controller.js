import Orders from "../../model/orders.model.js";
import {
  dateRangeFilter,
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

const paginatedOrders = async (req, extraFilter = {}) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q || "").trim();
  const filter = { ...dateRangeFilter(req.query), ...extraFilter };
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { user_email: regex },
      { FullName: regex },
      { phone1: regex },
      ...(Number.isFinite(Number(q)) ? [{ order_id: Number(q) }] : []),
    ];
  }
  const [data, total] = await Promise.all([
    Orders.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Orders.countDocuments(filter),
  ]);
  return { data, pagination: paginationPayload({ page, limit, total }) };
};

export const listShipping = async (req, res) => {
  const result = await paginatedOrders(req, {
    status: { $regex: /confirmed|packed|shipped|delivered/i },
  });
  return res.json(result);
};

export const listPayments = async (req, res) => {
  const filter = {};
  if (req.query.paymentStatus) {
    filter.payment_status = new RegExp(`^${escapeRegex(req.query.paymentStatus)}$`, "i");
  }
  const result = await paginatedOrders(req, filter);
  return res.json(result);
};

export const listReturns = async (req, res) => {
  const result = await paginatedOrders(req, {
    status: { $regex: /cancelled|return|refund|replaced/i },
  });
  return res.json(result);
};

export const markManualRefund = async (req, res) => {
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note || "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || !note) {
    return res.status(400).json({
      status: false,
      message: "Positive refund amount and admin note are required",
    });
  }
  const order = await Orders.findOneAndUpdate(
    { order_id: Number(req.params.id) },
    {
      refund_status: "PROCESSED",
      refund_amount: amount,
      admin_notes: note,
    },
    { new: true }
  ).lean();
  if (!order) return res.status(404).json({ status: false, message: "Order not found" });
  return res.json({ status: true, data: order });
};
