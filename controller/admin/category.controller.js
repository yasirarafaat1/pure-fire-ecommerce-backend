import { Catagories } from "../../model/catagory.model.js";
export const buildCategoryTree = (categories) => {
  const map = new Map();
  categories.forEach((doc) => {
    const obj = doc.toObject();
    obj.id = obj._id; // convenience for frontend
    obj.children = [];
    map.set(String(obj._id), obj);
  });
  const roots = [];
  map.forEach((cat) => {
    const parentId = cat.parent ? String(cat.parent) : null;
    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(cat);
    } else {
      roots.push(cat);
    }
  });
  const sortDeep = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortDeep(n.children));
  };
  sortDeep(roots);
  return roots;
};
export const createCategory = async (req, res) => {
  const { name, parentId, levels } = req.body;
  try {
    // allow creating an entire chain in one request: ["Mens", "Bottom Wear", "Jeans"]
    if (Array.isArray(levels) && levels.length > 0) {
      let parentDoc = null;
      for (const rawName of levels) {
        const trimmed = (rawName || "").trim();
        if (!trimmed) {
          return res
            .status(400)
            .json({ status: false, message: "Category names cannot be empty." });
        }
        const parentRef = parentDoc ? parentDoc._id : null;
        let existing = await Catagories.findOne({
          name: trimmed,
          parent: parentRef,
        });
        if (!existing) {
          const ancestors = parentDoc
            ? [
                ...parentDoc.ancestors,
                { _id: parentDoc._id, name: parentDoc.name },
              ]
            : [];
          existing = await Catagories.create({
            name: trimmed,
            parent: parentRef,
            ancestors,
          });
        }
        parentDoc = existing;
      }
      return res.status(201).json({
        status: true,
        message: "Category chain ensured/created successfully",
        category: parentDoc,
      });
    }
    const trimmed = (name || "").trim();
    if (!trimmed) {
      return res.status(400).json({ status: false, message: "Category name required" });
    }
    let parentDoc = null;
    let ancestors = [];
    if (parentId) {
      parentDoc = await Catagories.findById(parentId);
      if (!parentDoc) {
        return res
          .status(404)
          .json({ status: false, message: "Parent category not found" });
      }
      ancestors = [
        ...parentDoc.ancestors,
        { _id: parentDoc._id, name: parentDoc.name },
      ];
    }
    const result = await Catagories.create({
      name: trimmed,
      parent: parentDoc ? parentDoc._id : null,
      ancestors,
    });
    res.status(201).json({ status: true, category: result });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: false,
        message: "Category already exists at this level",
      });
    }
    console.error("createCategory error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
export const renameCategory = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      return res
        .status(400)
        .json({ status: false, message: "New category name required" });
    }
    const cat = await Catagories.findById(id);
    if (!cat) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }
    const sibling = await Catagories.findOne({
      _id: { $ne: id },
      parent: cat.parent,
      name: trimmed,
    });
    if (sibling) {
      return res
        .status(409)
        .json({ status: false, message: "A category with this name already exists at this level" });
    }
    cat.name = trimmed;
    await cat.save();
    // keep descendant ancestor names in sync
    await Catagories.updateMany(
      { "ancestors._id": cat._id },
      { $set: { "ancestors.$[elem].name": trimmed } },
      { arrayFilters: [{ "elem._id": cat._id }] }
    );
    return res.status(200).json({ status: true, category: cat });
  } catch (error) {
    console.error("renameCategory error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};
export const deleteCategory = async (req, res) => {
  // business rule: categories are not deletable, only editable/renamable
  return res.status(405).json({
    status: false,
    message: "Category deletion is disabled. Please rename or reuse categories instead.",
  });
};
export const getCategoryTree = async (_req, res) => {
  try {
    const categories = await Catagories.find({}).sort({ name: 1 });
    const tree = buildCategoryTree(categories);
    res.status(200).json({ status: true, categories: tree });
  } catch (error) {
    console.error("getCategoryTree error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};
export const getCategories = async (_req, res) => {
  // backwards compatibility alias to the tree endpoint
  return getCategoryTree(_req, res);
};
// ---------- Top products ----------
