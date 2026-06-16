import Profile from "../../model/profile.model.js";
import Orders from "../../model/orders.model.js";
import Addresses from "../../model/addresses.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

export const listCustomers = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q || "").trim();
  const match = q
    ? {
        $or: [
          { email: new RegExp(escapeRegex(q), "i") },
          { name: new RegExp(escapeRegex(q), "i") },
        ],
      }
    : {};
  const [data, total] = await Promise.all([
    Profile.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "orders",
          localField: "email",
          foreignField: "user_email",
          as: "orders",
        },
      },
      {
        $project: {
          email: 1,
          name: 1,
          gender: 1,
          createdAt: 1,
          orderCount: { $size: "$orders" },
          totalSpent: { $sum: "$orders.amount" },
          lastOrderAt: { $max: "$orders.createdAt" },
          phone: { $arrayElemAt: ["$orders.phone1", 0] },
        },
      },
      { $sort: { lastOrderAt: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]),
    Profile.countDocuments(match),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const getCustomer = async (req, res) => {
  const email = decodeURIComponent(req.params.email).trim().toLowerCase();
  const [profile, orders, addresses] = await Promise.all([
    Profile.findOne({ email }).lean(),
    Orders.find({ user_email: email }).sort({ createdAt: -1 }).lean(),
    Addresses.find({ email }).sort({ createdAt: -1 }).lean(),
  ]);
  if (!profile && !orders.length) {
    return res.status(404).json({ status: false, message: "Customer not found" });
  }
  return res.json({
    status: true,
    data: {
      profile: profile || { email },
      orders,
      addresses,
      summary: {
        orderCount: orders.length,
        totalSpent: orders.reduce((total, order) => total + Number(order.amount || 0), 0),
        lastOrderAt: orders[0]?.createdAt || null,
      },
    },
  });
};
