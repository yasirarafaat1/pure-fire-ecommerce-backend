import Profile from "../../model/profile.model.js";
import Orders from "../../model/orders.model.js";
import Addresses from "../../model/addresses.model.js";
import UserActivity from "../../model/activity.model.js";
import UserSession from "../../model/session.model.js";
import Wishlist from "../../model/wishlist.model.js";
import Products from "../../model/product.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

const normalizeEmail = (value) => decodeURIComponent(value || "").trim().toLowerCase();

const toProductPreview = (product) => ({
  _id: product._id,
  product_id: product.product_id,
  title: product.title || product.name || "Product",
  name: product.name || product.title || "Product",
  image: product.product_image?.[0] || product.colorVariants?.[0]?.images?.[0] || "",
  price: product.selling_price || product.price || 0,
  mrp: product.price || product.selling_price || 0,
  status: product.status,
});

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
          status: { $ifNull: ["$status", "ACTIVE"] },
          blockedAt: 1,
          blockReason: 1,
          lastLoginAt: 1,
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
  const email = normalizeEmail(req.params.email);
  const [profile, orders, orderTotal, totalSpentAgg, addresses, activity, sessions, wishlistRows] = await Promise.all([
    Profile.findOne({ email }).lean(),
    Orders.find({ user_email: email }).sort({ createdAt: -1 }).limit(25).lean(),
    Orders.countDocuments({ user_email: email }),
    Orders.aggregate([
      { $match: { user_email: email } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Addresses.find({ email }).sort({ createdAt: -1 }).lean(),
    UserActivity.findOne({ email }).lean(),
    UserSession.find({ email }).sort({ createdAt: -1 }).limit(15).lean(),
    Wishlist.find({ email }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  if (!profile && !orders.length) {
    return res.status(404).json({ status: false, message: "Customer not found" });
  }

  const productIds = [
    ...(activity?.recent_viewed || []),
    ...wishlistRows.map((item) => item.product_id),
  ].filter(Boolean);
  const uniqueProductIds = [...new Set(productIds)];
  const products = uniqueProductIds.length
    ? await Products.find({ product_id: { $in: uniqueProductIds } })
        .select("product_id title name product_image colorVariants selling_price price status")
        .lean()
    : [];
  const productMap = new Map(products.map((product) => [product.product_id, product]));
  const now = Date.now();

  return res.json({
    status: true,
    data: {
      profile: profile || { email, status: "ACTIVE" },
      orders,
      addresses,
      sessions: sessions.map((session) => ({
        _id: session._id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        active: !session.expiresAt || new Date(session.expiresAt).getTime() > now,
      })),
      activity: {
        recentSearches: activity?.recent_searches || [],
        recentViewedProductIds: activity?.recent_viewed || [],
        suggestedProductIds: activity?.suggested_product_ids || [],
        recentViewedProducts: (activity?.recent_viewed || [])
          .map((id) => productMap.get(id))
          .filter(Boolean)
          .map(toProductPreview),
        updatedAt: activity?.updatedAt || null,
      },
      wishlist: {
        count: wishlistRows.length,
        products: wishlistRows
          .map((item) => productMap.get(item.product_id))
          .filter(Boolean)
          .map(toProductPreview),
      },
      summary: {
        orderCount: orderTotal,
        totalSpent: Number(totalSpentAgg[0]?.total || 0),
        lastOrderAt: orders[0]?.createdAt || null,
        addressCount: addresses.length,
        activeSessionCount: sessions.filter(
          (session) => !session.expiresAt || new Date(session.expiresAt).getTime() > now
        ).length,
        wishlistCount: wishlistRows.length,
        recentSearchCount: activity?.recent_searches?.length || 0,
      },
    },
  });
};

export const updateCustomerStatus = async (req, res) => {
  const email = normalizeEmail(req.params.email);
  const status = String(req.body?.status || "").trim().toUpperCase();
  const reason = String(req.body?.reason || "").trim().slice(0, 300);

  if (!email) {
    return res.status(400).json({ status: false, message: "Customer email is required" });
  }

  if (!["ACTIVE", "BLOCKED"].includes(status)) {
    return res.status(400).json({ status: false, message: "Invalid customer status" });
  }

  const update =
    status === "BLOCKED"
      ? {
          status,
          blockedAt: new Date(),
          blockedBy: req.admin?._id || null,
          blockReason: reason,
          unblockedAt: null,
        }
      : {
          status,
          blockedAt: null,
          blockedBy: null,
          blockReason: "",
          unblockedAt: new Date(),
        };

  const profile = await Profile.findOneAndUpdate(
    { email },
    { $set: { email, ...update } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (status === "BLOCKED") {
    await UserSession.deleteMany({ email });
  }

  return res.json({
    status: true,
    message: status === "BLOCKED" ? "Customer blocked" : "Customer unblocked",
    data: { profile },
  });
};
