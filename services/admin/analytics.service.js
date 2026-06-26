import Cart from "../../model/cart.model.js";
import Catagories from "../../model/catagory.model.js";
import Orders from "../../model/orders.model.js";
import Products from "../../model/product.model.js";
import Profile from "../../model/profile.model.js";
import Wishlist from "../../model/wishlist.model.js";

const RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

const paidOrDeliveredMatch = {
  $or: [
    { payment_status: { $regex: /^paid$/i } },
    { status: { $regex: /^delivered$/i } },
  ],
};

const statusRegex = (pattern) => ({ status: { $regex: pattern, $options: "i" } });

const rangeStart = (range) => {
  const safeRange = RANGE_DAYS[range] ? range : "30d";
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (RANGE_DAYS[safeRange] - 1));
  return { range: safeRange, start };
};

const dateKey = (date, range) => {
  const d = new Date(date);
  if (range === "12m") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return d.toISOString().slice(0, 10);
};

const buildSeriesBuckets = (range, start) => {
  const buckets = [];
  const cursor = new Date(start);
  const now = new Date();
  if (range === "12m") {
    cursor.setDate(1);
    for (let i = 0; i < 12; i += 1) {
      buckets.push({ date: dateKey(cursor, range), revenue: 0, orders: 0, customers: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
  }
  while (cursor <= now) {
    buckets.push({ date: dateKey(cursor, range), revenue: 0, orders: 0, customers: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
};

const hydrateSeries = (base, rows, fields) => {
  const byDate = new Map(base.map((item) => [item.date, { ...item }]));
  rows.forEach((row) => {
    const target = byDate.get(row.date);
    if (!target) return;
    fields.forEach((field) => {
      target[field] = row[field] || 0;
    });
  });
  return Array.from(byDate.values());
};

export const getAnalyticsSummary = async ({ range: requestedRange }) => {
  const { range, start } = rangeStart(requestedRange);
  const rangeMatch = { createdAt: { $gte: start } };
  const baseBuckets = buildSeriesBuckets(range, start);
  const dateFormat = range === "12m" ? "%Y-%m" : "%Y-%m-%d";

  const [
    revenueAgg,
    orderCounts,
    productCounts,
    totalCustomers,
    newCustomers,
    returningCustomers,
    revenueRows,
    orderRows,
    customerRows,
    orderStatusBreakdown,
    topProducts,
    productRevenue,
    lowStockProducts,
    outOfStockProducts,
    topCustomers,
    categories,
    categoryProductRows,
    cartCount,
    wishlistCount,
  ] = await Promise.all([
    Orders.aggregate([
      { $match: { ...paidOrDeliveredMatch, ...rangeMatch } },
      { $group: { _id: null, revenuePaise: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    Promise.all([
      Orders.countDocuments(rangeMatch),
      Orders.countDocuments({ ...rangeMatch, ...statusRegex(/^delivered$/) }),
      Orders.countDocuments({ ...rangeMatch, ...statusRegex(/^pending$/) }),
      Orders.countDocuments({ ...rangeMatch, ...statusRegex(/cancel/) }),
      Orders.countDocuments({ ...rangeMatch, ...statusRegex(/return/) }),
    ]),
    Promise.all([
      Products.countDocuments(),
      Products.countDocuments({ status: "published" }),
      Products.countDocuments({ quantity: { $lte: 0 } }),
    ]),
    Profile.countDocuments(),
    Profile.countDocuments({ createdAt: { $gte: start } }),
    Orders.aggregate([
      { $group: { _id: "$user_email", count: { $sum: 1 } } },
      { $match: { _id: { $nin: [null, ""] }, count: { $gt: 1 } } },
      { $count: "count" },
    ]),
    Orders.aggregate([
      { $match: { ...paidOrDeliveredMatch, ...rangeMatch } },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: "$createdAt" } },
          revenue: { $sum: { $divide: ["$amount", 100] } },
        },
      },
      { $project: { _id: 0, date: "$_id", revenue: { $round: ["$revenue", 2] } } },
      { $sort: { date: 1 } },
    ]),
    Orders.aggregate([
      { $match: rangeMatch },
      { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, orders: { $sum: 1 } } },
      { $project: { _id: 0, date: "$_id", orders: 1 } },
      { $sort: { date: 1 } },
    ]),
    Profile.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, customers: { $sum: 1 } } },
      { $project: { _id: 0, date: "$_id", customers: 1 } },
      { $sort: { date: 1 } },
    ]),
    Orders.aggregate([
      { $match: rangeMatch },
      { $group: { _id: { $toUpper: { $ifNull: ["$status", "UNKNOWN"] } }, count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
      { $sort: { count: -1 } },
    ]),
    Orders.aggregate([
      { $match: rangeMatch },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product_id",
          quantitySold: { $sum: "$items.quantity" },
          orderCount: { $sum: 1 },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
      { $lookup: { from: "products", localField: "_id", foreignField: "product_id", as: "product" } },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productId: "$_id",
          name: { $ifNull: ["$product.name", "$product.title"] },
          sku: "$product.sku",
          orderCount: 1,
          quantitySold: 1,
          revenue: { $round: ["$revenue", 2] },
        },
      },
    ]),
    Orders.aggregate([
      { $match: { ...paidOrDeliveredMatch, ...rangeMatch } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product_id",
          quantitySold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: "products", localField: "_id", foreignField: "product_id", as: "product" } },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productId: "$_id",
          name: { $ifNull: ["$product.name", "$product.title"] },
          sku: "$product.sku",
          quantitySold: 1,
          revenue: { $round: ["$revenue", 2] },
        },
      },
    ]),
    Products.find({
      status: "published",
      $expr: { $and: [{ $gt: ["$quantity", 0] }, { $lte: ["$quantity", { $ifNull: ["$lowStockThreshold", 5] }] }] },
    })
      .select("product_id name title sku quantity lowStockThreshold")
      .sort({ quantity: 1 })
      .limit(10)
      .lean(),
    Products.find({ quantity: { $lte: 0 } })
      .select("product_id name title sku quantity")
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
    Orders.aggregate([
      { $match: rangeMatch },
      {
        $group: {
          _id: "$user_email",
          name: { $first: "$FullName" },
          orderCount: { $sum: 1 },
          revenuePaise: { $sum: "$amount" },
        },
      },
      { $match: { _id: { $nin: [null, ""] } } },
      { $sort: { revenuePaise: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          email: "$_id",
          name: 1,
          orderCount: 1,
          revenue: { $round: [{ $divide: ["$revenuePaise", 100] }, 2] },
        },
      },
    ]),
    Catagories.find().select("_id name").lean(),
    Orders.aggregate([
      { $match: { ...paidOrDeliveredMatch, ...rangeMatch } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.product_id", foreignField: "product_id", as: "product" } },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$product.catagory_id",
          orders: { $sum: 1 },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $project: { _id: 1, orders: 1, revenue: { $round: ["$revenue", 2] } } },
    ]),
    Cart.countDocuments(),
    Wishlist.countDocuments(),
  ]);

  const categoryMap = new Map(categories.map((cat) => [String(cat._id), cat.name]));
  const categoryBreakdown = categoryProductRows.map((row) => ({
    categoryId: String(row._id || ""),
    category: categoryMap.get(String(row._id || "")) || "Uncategorized",
    orders: row.orders || 0,
    revenue: row.revenue || 0,
  }));

  const revenueSeries = hydrateSeries(baseBuckets, revenueRows, ["revenue"]);
  const orderSeries = hydrateSeries(baseBuckets, orderRows, ["orders"]);
  const customerSeries = hydrateSeries(baseBuckets, customerRows, ["customers"]);
  const revenue = revenueAgg[0]?.revenuePaise ? revenueAgg[0].revenuePaise / 100 : 0;
  const revenueOrderCount = revenueAgg[0]?.count || 0;
  const totalOrders = orderCounts[0] || 0;
  const returningCustomerCount = returningCustomers[0]?.count || 0;

  return {
    range,
    kpis: {
      totalRevenue: revenue,
      totalOrders,
      deliveredOrders: orderCounts[1] || 0,
      pendingOrders: orderCounts[2] || 0,
      cancelledOrders: orderCounts[3] || 0,
      returnOrders: orderCounts[4] || 0,
      totalProducts: productCounts[0] || 0,
      activeProducts: productCounts[1] || 0,
      outOfStockProducts: productCounts[2] || 0,
      totalCustomers,
      newCustomers,
      returningCustomers: returningCustomerCount,
      averageOrderValue: revenueOrderCount ? revenue / revenueOrderCount : 0,
      repeatPurchaseRate: totalCustomers ? (returningCustomerCount / totalCustomers) * 100 : 0,
    },
    revenueSeries,
    orderSeries,
    orderStatusBreakdown,
    topProducts,
    productRevenue,
    lowStockProducts: lowStockProducts.map((product) => ({
      productId: product.product_id,
      name: product.name || product.title || `Product #${product.product_id}`,
      sku: product.sku || "",
      quantity: product.quantity || 0,
      lowStockThreshold: product.lowStockThreshold || 5,
    })),
    outOfStockProducts: outOfStockProducts.map((product) => ({
      productId: product.product_id,
      name: product.name || product.title || `Product #${product.product_id}`,
      sku: product.sku || "",
      quantity: product.quantity || 0,
    })),
    customerSeries,
    topCustomers,
    categoryBreakdown,
    trackingAvailability: {
      productViews: { available: false, count: 0 },
      addToCart: { available: true, count: cartCount },
      wishlist: { available: true, count: wishlistCount },
    },
  };
};
