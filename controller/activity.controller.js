import UserActivity from "../model/activity.model.js";
import Products from "../model/product.model.js";
import Reviews from "../model/review.model.js";
import Catagories from "../model/catagory.model.js";

const uniqLower = (arr = []) => {
  const seen = new Set();
  const out = [];
  arr.forEach((v) => {
    const s = String(v || "").trim().toLowerCase();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
};

const upsertActivity = async (email, data) =>
  UserActivity.findOneAndUpdate(
    { email },
    { $set: { email, ...data } },
    { upsert: true, returnDocument: "after" }
  );

export const addRecentSearch = async (req, res) => {
  try {
    const email = req.user?.email || "";
    const queryRaw = req.body?.query || "";
    const query = String(queryRaw || "").trim().toLowerCase();
    if (!email || !query) return res.status(200).json({ status: true });

    const doc = await UserActivity.findOne({ email }).lean();
    const current = Array.isArray(doc?.recent_searches) ? doc.recent_searches : [];
    const next = uniqLower([query, ...current]).slice(0, 12);
    await upsertActivity(email, { recent_searches: next });
    return res.status(200).json({ status: true, recent_searches: next });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Failed to save search" });
  }
};

export const addRecentViewed = async (req, res) => {
  try {
    const email = req.user?.email || "";
    const productId = Number(req.body?.product_id);
    if (!email || !productId) return res.status(200).json({ status: true });

    const doc = await UserActivity.findOne({ email }).lean();
    const current = Array.isArray(doc?.recent_viewed) ? doc.recent_viewed : [];
    const next = [productId, ...current.filter((id) => Number(id) !== productId)].slice(0, 20);
    await upsertActivity(email, { recent_viewed: next });
    return res.status(200).json({ status: true, recent_viewed: next });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Failed to save view" });
  }
};

export const getSuggestedProducts = async (req, res) => {
  try {
    const email = req.user?.email || "";
    if (!email) return res.status(200).json({ status: true, products: [] });

    const doc = await UserActivity.findOne({ email }).lean();
    const recentSearches = Array.isArray(doc?.recent_searches) ? doc.recent_searches : [];
    const recentViewed = Array.isArray(doc?.recent_viewed) ? doc.recent_viewed : [];
    if (!recentSearches.length && !recentViewed.length) {
      return res.status(200).json({ status: true, products: [] });
    }

    const viewedProducts = recentViewed.length
      ? await Products.find({ product_id: { $in: recentViewed }, status: "published" })
          .select("product_id catagory_id")
          .lean()
      : [];
    const catIds = new Set(
      viewedProducts
        .map((p) => String(p?.catagory_id || ""))
        .filter((id) => id && id !== "undefined")
    );

    const searchTokens = uniqLower(
      recentSearches.flatMap((q) => String(q).split(/\s+/).filter((w) => w.length > 2))
    );
    if (searchTokens.length) {
      const or = searchTokens.map((t) => ({ name: { $regex: t, $options: "i" } }));
      const cats = await Catagories.find({ $or: or }).select("_id").lean();
      cats.forEach((c) => c?._id && catIds.add(String(c._id)));
    }

    if (!catIds.size) return res.status(200).json({ status: true, products: [] });

    const products = await Products.find({ catagory_id: { $in: Array.from(catIds) }, status: "published" })
      .sort({ product_id: -1 })
      .limit(30)
      .lean();

    if (!products.length) return res.status(200).json({ status: true, products: [] });

    const ids = products.map((p) => p.product_id).filter(Boolean);
    const reviewAgg = await Reviews.aggregate([
      { $match: { product_id: { $in: ids } } },
      { $group: { _id: "$product_id", reviewCount: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
    ]);
    const reviewMap = new Map(
      reviewAgg.map((r) => [r._id, { reviewCount: r.reviewCount, avgRating: r.avgRating }])
    );

    const shaped = products.map((p) => {
      const stats = reviewMap.get(p.product_id) || {};
      return { ...p, reviewCount: stats.reviewCount || 0, avgRating: stats.avgRating || 0 };
    });

    await upsertActivity(email, { suggested_product_ids: shaped.map((p) => p.product_id).slice(0, 50) });
    return res.status(200).json({ status: true, products: shaped.slice(0, 8) });
  } catch (error) {
    return res.status(500).json({ status: false, message: "Failed to load suggestions" });
  }
};
