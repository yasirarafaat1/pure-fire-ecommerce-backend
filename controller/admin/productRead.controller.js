import { Catagories } from "../../model/catagory.model.js";
import Products from "../../model/product.model.js";
import { buildProductSearchFilter, filterProductsByColorName, pickMatchedColor, parseSearchQuery, buildTokenRegex } from "../../utils/search.js";
export const getProducts = async (_req, res) => {
  try {
    const products = await Products.find({ status: "published" })
      .populate({ path: "catagory_id", select: "name parent ancestors" })
      .sort({ product_id: -1 });
    res.status(200).json({ status: true, products });
  } catch (error) {
    console.error("getProducts error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch products", error: error.message });
  }
};
export const searchProducts = async (req, res) => {
    try {
      const q = (req.query.q || "").toString().trim();
      if (!q) return res.status(200).json({ status: true, products: [], suggestions: [] });
      const parsed = parseSearchQuery(q);
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
      if (q.trim()) {
        const fullRegex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const cats = await Catagories.find({
          $or: [{ name: fullRegex }, { "ancestors.name": fullRegex }],
        }).select("_id");
        fallbackCategoryIds = cats.map((c) => c._id);
      }
      const { filter } = buildProductSearchFilter(q, {
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
      let products = await Products.find(filter)
        .populate({ path: "catagory_id", select: "name parent ancestors" })
        .limit(50)
        .lean();
      if (parsed.colorNames?.length) {
        products = filterProductsByColorName(products, parsed.colorNames, parsed.colorHexes || []);
      }
      if (parsed.colorNames?.length || parsed.colorHexes?.length) {
        products = products.map((p) => ({
          ...p,
          matchedColor: pickMatchedColor(p, parsed.colorNames || [], parsed.colorHexes || []),
        }));
      }
      const suggestionsSet = new Set();
      products.forEach((p) => {
        const parts = `${p.name || ""} ${p.title || ""} ${p.catagory_id?.name || ""}`
          .split(/\s+/)
          .filter(Boolean);
        parts.forEach((w) => {
          if (w.toLowerCase().startsWith(q.toLowerCase())) suggestionsSet.add(w);
        });
      });
      res.status(200).json({
        status: true,
        products,
        suggestions: Array.from(suggestionsSet).slice(0, 15),
      });
    } catch (error) {
      console.error("searchProducts error:", error);
      res.status(500).json({ status: false, message: "Search failed" });
    }
  };
