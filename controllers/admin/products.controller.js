import Products from "../../model/product.model.js";
import DraftProducts from "../../model/draftProduct.model.js";
import { Catagories } from "../../model/catagory.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

const productFilter = (query) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.category) filter.catagory_id = query.category;
  if (query.stock === "low") {
    filter.$expr = { $lte: ["$quantity", { $ifNull: ["$lowStockThreshold", 5] }] };
  }
  if (query.stock === "out") filter.quantity = { $lte: 0 };
  const q = String(query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { name: regex },
      { title: regex },
      { sku: regex },
      ...(Number.isFinite(Number(q)) ? [{ product_id: Number(q) }] : []),
    ];
  }
  return filter;
};

export const listProducts = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = productFilter(req.query);
  const [data, total] = await Promise.all([
    Products.find(filter)
      .populate("catagory_id", "name ancestors")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Products.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const getProduct = async (req, res) => {
  const product = await Products.findOne({
    $or: [
      { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : undefined },
      { product_id: Number(req.params.id) || -1 },
    ],
  })
    .populate("catagory_id", "name ancestors")
    .lean();
  if (!product) return res.status(404).json({ status: false, message: "Product not found" });
  return res.json({ status: true, data: product });
};

export const listDrafts = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q || "").trim();
  const regex = q ? new RegExp(escapeRegex(q), "i") : null;
  const filter = regex ? { $or: [{ name: regex }, { sku: regex }] } : {};
  const [data, total] = await Promise.all([
    DraftProducts.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    DraftProducts.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const listInventory = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = productFilter(req.query);
  const [data, total, categories] = await Promise.all([
    Products.find(filter)
      .select("product_id name sku quantity lowStockThreshold status selling_price price catagory_id updatedAt")
      .populate("catagory_id", "name")
      .sort({ quantity: 1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Products.countDocuments(filter),
    Catagories.find({ status: { $ne: "INACTIVE" } }).select("name").sort({ name: 1 }).lean(),
  ]);
  return res.json({
    data,
    categories,
    pagination: paginationPayload({ page, limit, total }),
  });
};

export const updateInventory = async (req, res) => {
  const quantity = Number(req.body?.quantity);
  const lowStockThreshold = Number(req.body?.lowStockThreshold);
  if (!Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ status: false, message: "Quantity must be a non-negative integer" });
  }
  const update = { quantity };
  if (Number.isInteger(lowStockThreshold) && lowStockThreshold >= 0) {
    update.lowStockThreshold = lowStockThreshold;
  }
  const product = await Products.findOneAndUpdate(
    { product_id: Number(req.params.id) },
    update,
    { new: true, runValidators: true }
  ).lean();
  if (!product) return res.status(404).json({ status: false, message: "Product not found" });
  return res.json({ status: true, data: product });
};
