import Products from "../../model/product.model.js";
import Orders from "../../model/orders.model.js";
import Reviews from "../../model/review.model.js";
import Wishlist from "../../model/wishlist.model.js";
export const topProducts = async (_req, res) => {
  try {
    const ordersAgg = await Orders.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.product_id", orderedQty: { $sum: "$items.quantity" }, orderCount: { $sum: 1 } } },
    ]);
    const reviewAgg = await Reviews.aggregate([
      { $group: { _id: "$product_id", reviewCount: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
    ]);
    const wishAgg = await Wishlist.aggregate([
      { $group: { _id: "$product_id", wishCount: { $sum: 1 } } },
    ]);
    const metricsMap = new Map();
    const upsert = (id, data) => {
      const curr =
        metricsMap.get(id) || { orderedQty: 0, orderCount: 0, reviewCount: 0, avgRating: 0, wishCount: 0 };
      metricsMap.set(id, { ...curr, ...data });
    };
    ordersAgg.forEach((o) => upsert(o._id, { orderedQty: o.orderedQty, orderCount: o.orderCount }));
    reviewAgg.forEach((r) => upsert(r._id, { reviewCount: r.reviewCount, avgRating: r.avgRating || 0 }));
    wishAgg.forEach((w) => upsert(w._id, { wishCount: w.wishCount }));
    const scored = [];
    metricsMap.forEach((m, id) => {
      const score = m.orderedQty * 3 + m.orderCount + m.reviewCount * 1.5 + m.wishCount + m.avgRating * 2;
      scored.push({ product_id: id, score, metrics: m });
    });
    scored.sort((a, b) => b.score - a.score);
    const topIds = scored.slice(0, 10).map((s) => s.product_id);
    const products = await Products.find({
      product_id: { $in: topIds },
      status: "published",
    })
      .select("product_id name title product_image selling_price price status catagory_id")
      .populate("catagory_id", "name")
      .lean();
    const map = new Map();
    products.forEach((p) => map.set(p.product_id, p));
    const result = scored
      .filter((s) => map.has(s.product_id))
      .slice(0, 10)
      .map((s) => ({ ...map.get(s.product_id), metrics: s.metrics }));
    res.status(200).json({ status: true, products: result });
  } catch (error) {
    console.error("topProducts error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};
// ---------- Banner carousel ----------
