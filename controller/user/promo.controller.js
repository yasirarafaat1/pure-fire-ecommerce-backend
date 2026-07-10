import Coupon from "../../model/coupon.model.js";
import Products from "../../model/product.model.js";
import {
  computePromoSubtotal,
  evaluatePromo,
  normalizeCode,
  promoMatchesItems,
  serializePromo,
} from "../../utils/promo.js";

const activePromoFilter = (now = new Date()) => ({
  status: "ACTIVE",
  $and: [
    { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    { $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }] },
  ],
});

const loadProductsForItems = async (items = []) => {
  const ids = Array.from(
    new Set(items.map((item) => Number(item?.product_id || item?.id || 0)).filter(Boolean))
  );
  if (!ids.length) return [];
  return Products.find({ product_id: { $in: ids }, status: "published" })
    .select("product_id catagory_id")
    .lean();
};

export const validatePromoCode = async (req, res) => {
  try {
    const code = normalizeCode(req.body?.code || req.body?.promoCode);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!code) return res.status(400).json({ status: false, ok: false, message: "Enter a promo code first." });
    if (!items.length) return res.status(400).json({ status: false, ok: false, message: "Cart items required" });

    const promo = await Coupon.findOne({ code }).lean();
    if (!promo) return res.status(404).json({ status: false, ok: false, message: "Promo code not found" });

    const products = await loadProductsForItems(items);
    const result = evaluatePromo({
      promo,
      items,
      products,
      subtotal: computePromoSubtotal(items),
    });

    if (!result.ok) {
      return res.status(400).json({ status: false, ok: false, message: result.message });
    }

    return res.json({ status: true, ...result });
  } catch (error) {
    console.error("validatePromoCode error:", error);
    return res.status(500).json({ status: false, ok: false, message: "Failed to validate promo code" });
  }
};

export const getPublicPromos = async (req, res) => {
  try {
    const productId = Number(req.query.product_id || req.query.productId || 0);
    const item = productId ? { product_id: productId, quantity: 1, price: Number(req.query.price || 1) } : null;
    const products = productId
      ? await Products.find({ product_id: productId, status: "published" }).select("product_id catagory_id").lean()
      : [];

    const promos = await Coupon.find(activePromoFilter())
      .select("code description discountType discountValue minimumOrderAmount minimumQuantity maxDiscountAmount target startsAt endsAt timer")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const filtered = promos.filter((promo) => {
      const scope = promo.target?.scope || "ALL_PRODUCTS";
      if (scope === "ALL_PRODUCTS") return !productId;
      if (!item) return false;
      return promoMatchesItems({ promo, items: [item], products });
    });

    return res.json({ status: true, promos: filtered.map(serializePromo) });
  } catch (error) {
    console.error("getPublicPromos error:", error);
    return res.status(500).json({ status: false, message: "Failed to load promo codes", promos: [] });
  }
};
