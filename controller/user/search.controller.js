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
export const searchProducts = async (req, res) => {
  try {
    const payload = req.body || {};
    const query = req.query || {};
    const search = (payload.search || query.search || "").toString();
    const page = payload.page || query.page || 1;
    const limit = payload.limit || query.limit || 12;

    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.max(Math.min(parseInt(limit, 10), 100), 1);

    const parsed = parseSearchQuery(search);
    const categoryTokenMap = new Map();
    if (parsed.textTokens?.length) {
      await Promise.all(
        parsed.textTokens.map(async (token) => {
          const regex = buildTokenRegex(token);
          if (!regex) {
            categoryTokenMap.set(token, []);
            return;
          }
          const cats = await Catagories.find({
            $or: [{ name: regex }, { "ancestors.name": regex }],
          }).select("_id");
          categoryTokenMap.set(
            token,
            cats.map((c) => c._id)
          );
        })
      );
    }
    let categoryIntersection = [];
    if (parsed.textTokens?.length) {
      const allHaveCats = parsed.textTokens.every(
        (token) => (categoryTokenMap.get(token) || []).length
      );
      if (allHaveCats) {
        const sets = parsed.textTokens.map((token) =>
          (categoryTokenMap.get(token) || []).map((id) => String(id))
        );
        categoryIntersection = sets.reduce((acc, curr) => acc.filter((id) => curr.includes(id)));
      }
    }
    let fallbackCategoryIds = [];
    if (search.trim()) {
      const fullRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const cats = await Catagories.find({
        $or: [{ name: fullRegex }, { "ancestors.name": fullRegex }],
      }).select("_id");
      fallbackCategoryIds = cats.map((c) => c._id);
    }

    const { filter } = buildProductSearchFilter(search, {
      parsed,
      categoryTokenMap,
      fallbackCategoryIds,
    });
    if (categoryIntersection.length) {
      if (filter.$and) filter.$and.push({ catagory_id: { $in: categoryIntersection } });
      else filter.catagory_id = { $in: categoryIntersection };
    }
    if (filter.$and) filter.$and.push({ status: "published" });
    else filter.status = "published";

    const total = await Products.countDocuments(filter);
    let products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate({ path: "catagory_id", select: "name parent ancestors" });
    if (parsed.colorNames?.length || parsed.colorHexes?.length) {
      products = filterProductsByColorName(products, parsed.colorNames || [], parsed.colorHexes || []);
      products = products.map((p) => {
        const base = typeof p?.toObject === "function" ? p.toObject() : p;
        return {
          ...base,
          matchedColor: pickMatchedColor(base, parsed.colorNames || [], parsed.colorHexes || []),
        };
      });
    }

    return res.status(200).json({
      status: true,
      products,
      pagination: { page: pageNum, limit: limitNum, total },
    });
  } catch (error) {
    console.error("searchProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
