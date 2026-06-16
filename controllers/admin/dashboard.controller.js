import Products from "../../model/product.model.js";
import Orders from "../../model/orders.model.js";
import Profile from "../../model/profile.model.js";
import Reviews from "../../model/review.model.js";
import AdminAudit from "../../model/adminAudit.model.js";

const paidMatch = {
  $or: [
    { payment_status: { $regex: /^paid$/i } },
    { status: { $regex: /delivered|confirmed|packed|shipped/i } },
  ],
};

export const getDashboard = async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    revenue,
    todayRevenue,
    totalOrders,
    pendingOrders,
    lowStockProducts,
    activeProducts,
    customers,
    pendingReviews,
    recentOrders,
    topProducts,
    statusBreakdown,
    recentActivity,
  ] = await Promise.all([
    Orders.aggregate([{ $match: paidMatch }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Orders.aggregate([
      { $match: { ...paidMatch, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Orders.countDocuments(),
    Orders.countDocuments({ status: { $regex: /pending/i } }),
    Products.countDocuments({
      status: "published",
      $expr: { $lte: ["$quantity", { $ifNull: ["$lowStockThreshold", 5] }] },
    }),
    Products.countDocuments({ status: "published" }),
    Profile.countDocuments(),
    Reviews.countDocuments({ status: "PENDING" }),
    Orders.find().sort({ createdAt: -1 }).limit(8).lean(),
    Orders.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.product_id", quantity: { $sum: "$items.quantity" } } },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "product_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      { $project: { productId: "$_id", quantity: 1, name: "$product.name", _id: 0 } },
    ]),
    Orders.aggregate([
      { $group: { _id: { $toUpper: "$status" }, count: { $sum: 1 } } },
      { $project: { status: "$_id", count: 1, _id: 0 } },
    ]),
    AdminAudit.find().sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  return res.json({
    status: true,
    data: {
      metrics: {
        totalRevenue: revenue[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0,
        totalOrders,
        pendingOrders,
        lowStockProducts,
        activeProducts,
        customers,
        pendingReviews,
      },
      recentOrders,
      topProducts,
      orderStatusBreakdown: statusBreakdown,
      recentActivity,
    },
  });
};
