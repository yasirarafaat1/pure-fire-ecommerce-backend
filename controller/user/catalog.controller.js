import Products from "../../model/product.model.js";
import { Catagories } from "../../model/catagory.model.js";
import Coupon from "../../model/coupon.model.js";
import Orders from "../../model/orders.model.js";
import Reviews from "../../model/review.model.js";
import Wishlist from "../../model/wishlist.model.js";
import { buildProductSearchFilter, filterProductsByColorName, pickMatchedColor, parseSearchQuery, buildTokenRegex } from "../../utils/search.js";
import { getCache, setCache } from "../../utils/cache.js";
import { promoMatchesItems, serializePromo } from "../../utils/promo.js";
const CACHE_TTL_SHORT = Number(process.env.CACHE_TTL_SHORT || 15000);
const CACHE_TTL_MED = Number(process.env.CACHE_TTL_MED || 30000);
const CACHE_TTL_LONG = Number(process.env.CACHE_TTL_LONG || 120000);
const parsePageLimit = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(Math.min(parseInt(req.query.limit || "12", 10), 100), 1);
  return { page, limit };
};

const publicPromoFilter = (now = new Date()) => ({
  status: "ACTIVE",
  $and: [
    { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    { $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] },
  ],
});

const loadProductPromos = async (product) => {
  if (!product?.product_id) return [];

  const item = {
    product_id: product.product_id,
    quantity: 1,
    price: Number(product.selling_price || product.price || 1),
  };
  const products = [
    {
      product_id: product.product_id,
      catagory_id: product.catagory_id,
    },
  ];
  const promos = await Coupon.find(publicPromoFilter())
    .select("code description discountType discountValue minimumOrderAmount minimumQuantity maxDiscountAmount target startsAt endsAt timer")
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  return promos
    .filter((promo) => {
      const scope = promo.target?.scope || "ALL_PRODUCTS";
      if (scope === "ALL_PRODUCTS") return false;
      return promoMatchesItems({ promo, items: [item], products });
    })
    .map(serializePromo);
};

export const showProducts = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const cacheKey = `showProducts:${page}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const total = await Products.countDocuments({});
    const products = await Products.find({})
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "catagory_id", select: "name parent ancestors" })
      .lean();

    const ids = products.map((p) => p.product_id).filter(Boolean);
    const reviewAgg = ids.length
      ? await Reviews.aggregate([
          { $match: { product_id: { $in: ids } } },
          { $group: { _id: "$product_id", reviewCount: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
        ])
      : [];
    const reviewMap = new Map(reviewAgg.map((r) => [r._id, r]));
    const shaped = products.map((p) => {
      const stats = reviewMap.get(p.product_id) || {};
      return { ...p, reviewCount: stats.reviewCount || 0, avgRating: stats.avgRating || 0 };
    });

    const payload = {
      status: true,
      products: shaped,
      pagination: { page, limit, total },
    };
    setCache(cacheKey, payload, CACHE_TTL_SHORT);
    return res.status(200).json(payload);
  } catch (error) {
    console.error("showProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
export const getProductById = async (req, res) => {
  try {
    const idParam = req.params.id;
    const product =
      (await Products.findOne({ product_id: Number(idParam) })) ||
      (await Products.findById(idParam));

    if (!product) {
      return res
        .status(200)
        .json({ status: 404, data: [], message: "Product not found" });
    }
    const cat =
      product.catagory_id &&
      (await Catagories.findById(product.catagory_id).lean());

    const shaped = {
      ...product.toObject(),
      catagory_id: 1, // legacy numeric fallback
      Catagory: cat ? { id: 1, name: cat.name } : undefined,
    };
    const promos = await loadProductPromos(product);

    return res.status(200).json({ status: 200, data: [shaped], promos });
  } catch (error) {
    console.error("getProductById error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
export const getProductByCategory = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const categoryName = req.params.category;
    const cacheKey = `productByCategory:${categoryName}:${page}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.status(200).json(cached);

    const category = await Catagories.findOne({ name: categoryName });
    if (!category) {
      const payload = { status: true, products: [], pagination: { page, limit, total: 0 } };
      setCache(cacheKey, payload, CACHE_TTL_SHORT);
      return res.status(200).json(payload);
    }

    const filter = { catagory_id: category._id };
    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const payload = {
      status: true,
      products,
      pagination: { page, limit, total },
    };
    setCache(cacheKey, payload, CACHE_TTL_SHORT);
    return res.status(200).json(payload);
  } catch (error) {
    console.error("getProductByCategory error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
