import { Catagories } from "../../model/catagory.model.js";
import Products from "../../model/product.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const listCategories = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const q = String(req.query.q || "").trim();
  const filter = {};
  if (q) filter.name = new RegExp(escapeRegex(q), "i");
  if (req.query.status) filter.status = req.query.status;
  const [data, total] = await Promise.all([
    Catagories.find(filter)
      .populate("parent", "name")
      .sort({ sortOrder: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Catagories.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const createCategory = async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const parentId = req.body?.parentId || null;
  if (!name) return res.status(400).json({ status: false, message: "Name is required" });
  const parent = parentId ? await Catagories.findById(parentId) : null;
  if (parentId && !parent) {
    return res.status(404).json({ status: false, message: "Parent category not found" });
  }
  if (parent && parent.ancestors.length >= 2) {
    return res.status(400).json({ status: false, message: "Only three category levels are supported" });
  }
  const ancestors = parent
    ? [...parent.ancestors, { _id: parent._id, name: parent.name }]
    : [];
  const category = await Catagories.create({
    name,
    slug: slugify(req.body.slug || name),
    parent: parent?._id || null,
    ancestors,
    description: String(req.body.description || ""),
    imageUrl: String(req.body.imageUrl || ""),
    status: req.body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    sortOrder: Number(req.body.sortOrder) || 0,
    metaTitle: String(req.body.metaTitle || ""),
    metaDescription: String(req.body.metaDescription || ""),
  });
  return res.status(201).json({ status: true, data: category });
};

export const updateCategory = async (req, res) => {
  const category = await Catagories.findById(req.params.id);
  if (!category) return res.status(404).json({ status: false, message: "Category not found" });
  const allowed = [
    "name",
    "slug",
    "description",
    "imageUrl",
    "status",
    "sortOrder",
    "metaTitle",
    "metaDescription",
  ];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) category[key] = req.body[key];
  });
  if (req.body.name && !req.body.slug) category.slug = slugify(req.body.name);
  await category.save();
  if (req.body.name) {
    await Catagories.updateMany(
      { "ancestors._id": category._id },
      { $set: { "ancestors.$[item].name": category.name } },
      { arrayFilters: [{ "item._id": category._id }] }
    );
  }
  return res.json({ status: true, data: category });
};

export const deleteCategory = async (req, res) => {
  const [productCount, childCount] = await Promise.all([
    Products.countDocuments({ catagory_id: req.params.id }),
    Catagories.countDocuments({ parent: req.params.id }),
  ]);
  if (productCount || childCount) {
    return res.status(409).json({
      status: false,
      message: "Category has products or child categories and cannot be deleted",
    });
  }
  const category = await Catagories.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ status: false, message: "Category not found" });
  return res.json({ status: true, message: "Category deleted" });
};
