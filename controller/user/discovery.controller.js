import Products from "../../model/product.model.js";
import { Catagories } from "../../model/catagory.model.js";
import Orders from "../../model/orders.model.js";
import Reviews from "../../model/review.model.js";
import Wishlist from "../../model/wishlist.model.js";
import { buildProductSearchFilter, filterProductsByColorName, pickMatchedColor, parseSearchQuery, buildTokenRegex } from "../../utils/search.js";
import { getCache, setCache } from "../../utils/cache.js";
const CACHE_TTL_SHORT = Number(process.env.CACHE_TTL_SHORT || 15000);
const CACHE_TTL_MED = Number(process.env.CACHE_TTL_MED || 30000);
const CACHE_TTL_LONG = Number(process.env.CACHE_TTL_LONG || 120000);
const parsePageLimit = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(Math.min(parseInt(req.query.limit || "12", 10), 100), 1);
  return { page, limit };
};
export const getTopProducts = async (_req, res) => {
  try {
    const cacheKey = "topProducts";
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

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
    const topIds = scored.slice(0, 20).map((s) => s.product_id);

    if (!topIds.length) {
      return res.status(200).json({ status: true, products: [] });
    }

    const products = await Products.find({ product_id: { $in: topIds }, status: "published" }).lean();
    const map = new Map(products.map((p) => [p.product_id, p]));
    const result = scored
      .filter((s) => map.has(s.product_id))
      .map((s) => {
        const prod = map.get(s.product_id);
        return {
          ...prod,
          reviewCount: s.metrics?.reviewCount || 0,
          avgRating: s.metrics?.avgRating || 0,
          orderedQty: s.metrics?.orderedQty || 0,
          orderCount: s.metrics?.orderCount || 0,
          wishCount: s.metrics?.wishCount || 0,
        };
      });

    const payload = { status: true, products: result };
    setCache(cacheKey, payload, CACHE_TTL_MED);
    return res.status(200).json(payload);
  } catch (error) {
    console.error("getTopProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
export const getCategories = async (_req, res) => {
  try {
    const cacheKey = "categories";
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const categories = await Catagories.find({}).sort({ name: 1 });
    const payload = { status: true, categories };
    setCache(cacheKey, payload, CACHE_TTL_LONG);
    return res.status(200).json(payload);
  } catch (error) {
    console.error("getCategories (user) error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
