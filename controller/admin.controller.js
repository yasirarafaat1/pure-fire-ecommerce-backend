import { Catagories } from "../model/catagory.model.js";
import Products from "../model/product.model.js";
import DraftProducts from "../model/draftProduct.model.js";
import Orders from "../model/orders.model.js";
import Reviews from "../model/review.model.js";
import Wishlist from "../model/wishlist.model.js";
import { getNextSequence } from "../model/counter.model.js";
import Banner from "../model/banner.model.js";
import { getMockOrderStatus, isShiprocketTestMode } from "../config/shiprocket.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from "../config/cloudinary.js";
import {
  buildProductSearchFilter,
  filterProductsByColorName,
  pickMatchedColor,
  parseSearchQuery,
  buildTokenRegex,
} from "../utils/search.js";

// ---------- Category helpers ----------
const buildCategoryTree = (categories) => {
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

const createCategory = async (req, res) => {
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

const parseArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((v) => String(v).trim());
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean).map((v) => String(v).trim());
    }
  } catch (_) {
    /* fall back */
  }
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

const parseHighlights = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => ({
          key: String(item.key || "").trim(),
          value: String(item.value || "").trim(),
        }))
        .filter((h) => h.key && h.value);
    }
  } catch (_) {
    /* fall through */
  }
  return [];
};

const parseColorVariants = (value) => {
  if (!value) return [];
  let arr = [];
  if (typeof value === "string") {
    try {
      arr = JSON.parse(value);
    } catch {
      arr = [];
    }
  } else if (Array.isArray(value)) {
    arr = value;
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .map((v) => ({
      color: (v.color || "").trim(),
      images: Array.isArray(v.images) ? v.images.filter(Boolean) : [],
      video: v.video || "",
      imageCount: Number(v.imageCount || v.images?.length || 0),
      hasVideo: v.hasVideo ?? !!v.video,
      price: v.price != null ? Number(v.price) : undefined,
      discountedPrice: v.discountedPrice != null ? Number(v.discountedPrice) : undefined,
      sizes: Array.isArray(v.sizes)
        ? v.sizes
            .map((s) => ({ label: (s.label || "").trim(), stock: Number(s.stock || 0) }))
            .filter((s) => s.label)
        : [],
      primary: Boolean(v.primary),
    }))
    .filter((v) => v.color);
};

const validateColorVariants = (cvs) => {
  if (!cvs.length) return "At least one color is required.";
  const seenImages = new Set();
  for (const cv of cvs) {
    const imgCount = cv.images?.length || cv.imageCount || 0;
    const hasVideo = !!cv.video || !!cv.hasVideo || !!cv.videoFile;
    if (imgCount < 5) return `Color ${cv.color} needs at least 5 images.`;
    if (!hasVideo) return `Color ${cv.color} needs exactly 1 video.`;
    if (!cv.sizes.length) return `Color ${cv.color} needs at least 1 size.`;
  }
  return null;
};

const applyColorVariantsToDoc = (doc, cvs) => {
  doc.colorVariants = cvs;
  doc.colors = cvs.map((c) => c.color);
  const sizeSet = new Set();
  cvs.forEach((c) => c.sizes.forEach((s) => sizeSet.add(s.label)));
  doc.sizes = Array.from(sizeSet);
  doc.product_image = cvs[0]?.images || [];
  doc.image_public_ids = [];
  doc.video_url = cvs[0]?.video || "";
  doc.video_public_id = "";
  // total quantity = sum of size stocks
  const totalQty = cvs.reduce(
    (sum, c) => sum + c.sizes.reduce((acc, s) => acc + (Number.isFinite(s.stock) ? s.stock : 0), 0),
    0
  );
  doc.quantity = totalQty;
};

const validateMediaRules = ({ status, imagesCount, videoCount }) => {
  if (imagesCount > 10) {
    return "Maximum 10 images allowed.";
  }
  if (status === "published") {
    if (imagesCount < 5) return "At least 5 images are required to publish.";
    if (videoCount !== 1) return "Exactly 1 video is required to publish.";
  }
  if (videoCount > 1) return "Only 1 video allowed.";
  return null;
};

const uploadMedia = async ({ productId, images = [], video }) => {
  const imageUrls = [];
  const imagePublicIds = [];
  for (const file of images) {
    const uploadRes = await uploadToCloudinary(
      file.buffer,
      `${productId}-${file.originalname}`,
      file.mimetype
    );
    imageUrls.push(uploadRes.secure_url);
    imagePublicIds.push(uploadRes.public_id);
  }

  let videoUrl = "";
  let videoPublicId = "";
  if (video) {
    const uploadRes = await uploadToCloudinary(
      video.buffer,
      `${productId}-${video.originalname}`,
      video.mimetype
    );
    videoUrl = uploadRes.secure_url;
    videoPublicId = uploadRes.public_id;
  }

  return { imageUrls, imagePublicIds, videoUrl, videoPublicId };
};

const uploadVariantMedia = async ({ productId, color, images = [], video }) => {
  const safeColor = (color || "color").replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = safeColor ? `${productId}-${safeColor}` : `${productId}-color`;
  const imgResult = await uploadMedia({ productId: prefix, images, video });
  return { images: imgResult.imageUrls, video: imgResult.videoUrl };
};

const stageFromLabel = (label = "") => {
  const l = label.toLowerCase();
  if (l.includes("pricing")) return "pricing";
  if (l.includes("media")) return "media";
  if (l.includes("detail")) return "details";
  if (l.includes("complete")) return "complete";
  return "category";
};

const normalizeFiles = (files) => {
  if (!files) return {};
  if (Array.isArray(files)) {
    const map = {};
    files.forEach((f) => {
      map[f.fieldname] = map[f.fieldname] || [];
      map[f.fieldname].push(f);
    });
    return map;
  }
  return files;
};

const uploadProduct = async (req, res) => {
  const files = normalizeFiles(req.files);
  const imageFiles = files.images || [];
  const videoFile = files.video?.[0];
  const variantImageFiles = files.variantImages || [];
  const variantVideoFiles = files.variantVideos || [];
  const removedImageUrls = parseArrayField(req.body.removedImageUrls || req.body.removed_image_urls);
  const removeVideoFlag = req.body.removeVideo === "true";

  const {
    name,
    title,
    price,
    quantity,
    sku,
    description,
    catagory,
    categoryId,
    specification,
    selling_price,
    selling_price_link,
    key_highlights,
    colors,
    sizes,
    status: rawStatus,
    draft_stage,
    colorVariants: rawColorVariants,
  } = req.body;
  const colorVariants = parseColorVariants(rawColorVariants || req.body.color_variants);

  const status = (rawStatus || "draft").toLowerCase();
  if (!["draft", "published"].includes(status)) {
    return res
      .status(400)
      .json({ status: false, message: "status must be 'draft' or 'published'" });
  }

  try {
    const providedCategoryId = categoryId || req.body.catagory_id;
    const category = providedCategoryId
      ? await Catagories.findById(providedCategoryId)
      : null;

    // still allow legacy name lookup but don't auto-create
    const fallbackCategory =
      !category && catagory ? await Catagories.findOne({ name: catagory.trim() }) : null;
    const finalCategory = category || fallbackCategory;
    if (!finalCategory) {
      return res.status(400).json({
        status: false,
        message: "Valid categoryId is required. Create/select a category before uploading products.",
      });
    }

    let specsArr = [];
    let highlightsArr = [];
    if (specification) {
      try {
        const parsed = JSON.parse(specification);
        specsArr = Object.entries(parsed).map(([key, value]) => ({
          key,
          value,
        }));
      } catch {
        return res.status(400).json({ message: "Invalid specification JSON" });
      }
    }
    if (key_highlights) {
      highlightsArr = parseHighlights(key_highlights);
      if (highlightsArr.length < 6 || highlightsArr.length > 10) {
        return res
          .status(400)
          .json({ status: false, message: "key_highlights must have 6-10 items" });
      }
    }

    if (colorVariants.length) {
      // attach file counts for validation
      let imgPtr = 0;
      let vidPtr = 0;
      colorVariants.forEach((cv) => {
        if (!cv.imageCount) cv.imageCount = Number(cv.images?.length || 0);
        if (cv.imageCount === 0) {
          const remaining = variantImageFiles.length - imgPtr;
          cv.imageCount = remaining > 0 ? remaining : 0;
        }
        if (!cv.hasVideo) {
          cv.hasVideo = !!cv.video || !!variantVideoFiles[vidPtr];
          vidPtr += cv.hasVideo ? 1 : 0;
        }
        imgPtr += cv.imageCount || 0;
      });
      const cvError = validateColorVariants(colorVariants);
      if (cvError) {
        return res.status(400).json({ status: false, message: cvError });
      }
    }

    const mediaError = validateMediaRules({
      status,
      imagesCount: colorVariants.length ? colorVariants[0].imageCount || 0 : imageFiles.length,
      videoCount: colorVariants.length ? (colorVariants[0].hasVideo ? 1 : 0) : videoFile ? 1 : 0,
    });
    if (mediaError) {
      return res.status(400).json({ status: false, message: mediaError });
    }

    if (status === "published") {
      if (!name || !price || !selling_price || !quantity || !sku) {
        return res.status(400).json({
          status: false,
          message: "name, price, selling_price, quantity, sku are required to publish",
        });
      }
    }

    const productId = await getNextSequence("product_id");

    let newProduct = new Products({
      product_id: productId,
      title,
      name,
      price: price !== undefined ? Number(price) : undefined,
      selling_price: selling_price !== undefined ? Number(selling_price) : undefined,
      description,
      selling_price_link,
      product_image: [],
      image_public_ids: [],
      video_url: "",
      video_public_id: "",
      quantity: quantity !== undefined ? Number(quantity) : undefined,
      sku,
      catagory_id: finalCategory._id,
      specifications: specsArr,
      key_highlights: highlightsArr,
      colors: parseArrayField(colors),
      sizes: parseArrayField(sizes),
      status,
      draft_stage: draft_stage || (status === "published" ? "complete" : "details"),
    });

    if (colorVariants.length) {
      let imgPtr = 0;
      let vidPtr = 0;
      for (const cv of colorVariants) {
        const imgs = variantImageFiles.slice(imgPtr, imgPtr + (cv.imageCount || 0));
        const vid = variantVideoFiles[vidPtr] || null;
        let uploaded = { images: [], video: "" };
        if (imgs.length || vid) {
          uploaded = await uploadVariantMedia({ productId, color: cv.color, images: imgs, video: vid });
        }
        cv.images = imgs.length ? uploaded.images : cv.images || [];
        cv.video = vid ? uploaded.video : cv.video || "";
        imgPtr += cv.imageCount || 0;
        if (vid) vidPtr += 1;
      }
      applyColorVariantsToDoc(newProduct, colorVariants);
    } else {
      const { imageUrls, imagePublicIds, videoUrl, videoPublicId } = await uploadMedia({
        productId,
        images: imageFiles,
        video: videoFile,
      });
      newProduct.product_image = imageUrls;
      newProduct.image_public_ids = imagePublicIds;
      newProduct.video_url = videoUrl;
      newProduct.video_public_id = videoPublicId;
    }

    await newProduct.save();

    res.status(201).json({
      message: status === "published" ? "Product published successfully!" : "Draft saved successfully!",
      product: newProduct,
      images: newProduct.product_image,
      video: newProduct.video_url,
    });
  } catch (error) {
    console.error("uploadProduct error:", error);
    res
      .status(500)
      .json({ message: "Server error", error: error.message || error });
  }
};

// ------- Drafts -------
const createDraftProduct = async (req, res) => {
  const files = normalizeFiles(req.files);
  const imageFiles = files.images || [];
  const videoFile = files.video?.[0];
  const variantImageFiles = files.variantImages || [];
  const variantVideoFiles = files.variantVideos || [];

  const {
    name,
    title,
    price,
    quantity,
    sku,
    description,
    catagory,
    categoryId,
    specification,
    selling_price,
    selling_price_link,
    key_highlights,
    colors,
    sizes,
    draft_stage,
    colorVariants: rawColorVariants,
  } = req.body;
  const colorVariants = parseColorVariants(rawColorVariants || req.body.color_variants);

  try {
    const providedCategoryId = categoryId || req.body.catagory_id;
    const category = providedCategoryId
      ? await Catagories.findById(providedCategoryId)
      : null;
    const fallbackCategory =
      !category && catagory ? await Catagories.findOne({ name: catagory.trim() }) : null;
    const finalCategory = category || fallbackCategory || null;

    let specsArr = [];
    if (specification) {
      try {
        const parsed = JSON.parse(specification);
        specsArr = Object.entries(parsed).map(([key, value]) => ({
          key,
          value,
        }));
      } catch {
        return res.status(400).json({ message: "Invalid specification JSON" });
      }
    }
    let highlightsArr = parseHighlights(key_highlights);
    if (highlightsArr.length && (highlightsArr.length < 6 || highlightsArr.length > 10)) {
      return res
        .status(400)
        .json({ status: false, message: "key_highlights must have 6-10 items" });
    }

    if (colorVariants.length) {
      let imgPtr = 0;
      let vidPtr = 0;
      colorVariants.forEach((cv) => {
        if (!cv.imageCount) cv.imageCount = Number(cv.images?.length || 0);
        if (cv.imageCount === 0) {
          const remaining = variantImageFiles.length - imgPtr;
          cv.imageCount = remaining > 0 ? remaining : 0;
        }
        if (!cv.hasVideo) {
          cv.hasVideo = !!cv.video || !!variantVideoFiles[vidPtr];
          vidPtr += cv.hasVideo ? 1 : 0;
        }
        imgPtr += cv.imageCount || 0;
      });
      const cvError = validateColorVariants(colorVariants);
      if (cvError) {
        return res.status(400).json({ status: false, message: cvError });
      }
    }

    const draftId = await getNextSequence("draft_id");
    let draft = new DraftProducts({
      draft_id: draftId,
      title,
      name,
      price: price ? Number(price) : undefined,
      selling_price: selling_price ? Number(selling_price) : undefined,
      description,
      selling_price_link,
      product_image: [],
      image_public_ids: [],
      video_url: "",
      video_public_id: "",
      quantity: quantity ? Number(quantity) : undefined,
      sku,
      catagory_id: finalCategory?._id,
      specifications: specsArr,
      key_highlights: highlightsArr,
      colors: parseArrayField(colors),
      sizes: parseArrayField(sizes),
      draft_stage: draft_stage || stageFromLabel(draft_stage) || "details",
      status: "draft",
    });

    if (colorVariants.length) {
      let imgPtr = 0;
      let vidPtr = 0;
      for (const cv of colorVariants) {
        const imgs = variantImageFiles.slice(imgPtr, imgPtr + (cv.imageCount || 0));
        const vid = variantVideoFiles[vidPtr] || null;
        let uploaded = { images: [], video: "" };
        if (imgs.length || vid) {
          uploaded = await uploadVariantMedia({
            productId: `draft-${draftId}`,
            color: cv.color,
            images: imgs,
            video: vid,
          });
        }
        cv.images = imgs.length ? uploaded.images : cv.images || [];
        cv.video = vid ? uploaded.video : cv.video || "";
        imgPtr += cv.imageCount || 0;
        if (vid) vidPtr += 1;
      }
      applyColorVariantsToDoc(draft, colorVariants);
    } else {
      const { imageUrls, imagePublicIds, videoUrl, videoPublicId } = await uploadMedia({
        productId: `draft-${draftId}`,
        images: imageFiles,
        video: videoFile,
      });
      draft.product_image = imageUrls;
      draft.image_public_ids = imagePublicIds;
      draft.video_url = videoUrl;
      draft.video_public_id = videoPublicId;
    }

    await draft.save();

    res.status(201).json({ status: true, draft });
  } catch (error) {
    console.error("createDraftProduct error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const updateProduct = async (req, res) => {
  const { product_id } = req.params;
  const files = normalizeFiles(req.files);
  const imageFiles = files.images || [];
  const videoFile = files.video?.[0];
  const variantImageFiles = files.variantImages || [];
  const variantVideoFiles = files.variantVideos || [];
  const removedImageUrls = parseArrayField(req.body.removedImageUrls || req.body.removed_image_urls);
  const removeVideoFlag = req.body.removeVideo === "true";
  const {
    name,
    title,
    price,
    quantity,
    sku,
    description,
    catagory,
    categoryId,
    specification,
    selling_price,
    selling_price_link,
    key_highlights,
    colors,
    sizes,
    status: rawStatus,
    draft_stage,
    colorVariants: rawColorVariants,
  } = req.body;
  const colorVariants = parseColorVariants(rawColorVariants || req.body.color_variants);

  const status = rawStatus ? rawStatus.toLowerCase() : undefined;

  try {
    const product = await Products.findOne({ product_id: Number(product_id) });
    if (!product) {
      return res
        .status(404)
        .json({ status: false, message: "Product not found" });
    }

    const providedCategoryId = categoryId || req.body.catagory_id;
    let categoryData = null;
    if (providedCategoryId) {
      categoryData = await Catagories.findById(providedCategoryId);
    }
    if (!categoryData && catagory) {
      categoryData = await Catagories.findOne({ name: catagory.trim() });
    }
    // allow status-only updates by falling back to existing category
    if (!categoryData) {
      categoryData = await Catagories.findById(product.catagory_id);
    }
    if (!categoryData) {
      return res.status(400).json({
        status: false,
        message: "Valid categoryId is required to update the product",
      });
    }

    let specsArr = product.specifications || [];
    let highlightsArr = product.key_highlights || [];
    if (specification) {
      try {
        const parsed = JSON.parse(specification);
        specsArr = Object.entries(parsed).map(([key, value]) => ({
          key,
          value,
        }));
      } catch {
        return res.status(400).json({ message: "Invalid specification JSON" });
      }
    }
    if (key_highlights) {
      highlightsArr = parseHighlights(key_highlights);
      if (highlightsArr.length < 6 || highlightsArr.length > 10) {
        return res.status(400).json({
          status: false,
          message: "key_highlights must have 6-10 items",
        });
      }
    }

    if (colorVariants.length) {
      let imgPtr = 0;
      let vidPtr = 0;
      colorVariants.forEach((cv) => {
        if (!cv.imageCount) cv.imageCount = Number(cv.images?.length || 0);
        if (cv.imageCount === 0) {
          const remaining = variantImageFiles.length - imgPtr;
          cv.imageCount = remaining > 0 ? remaining : 0;
        }
        if (!cv.hasVideo) {
          cv.hasVideo = !!cv.video || !!variantVideoFiles[vidPtr];
          vidPtr += cv.hasVideo ? 1 : 0;
        }
        imgPtr += cv.imageCount || 0;
      });
      const cvError = validateColorVariants(colorVariants);
      if (cvError) {
        return res.status(400).json({ status: false, message: cvError });
      }
    }

    // compute current images after removal but before adding new files
    let currentImages = product.product_image || [];
    let currentPublicIds = product.image_public_ids || [];

    if (!colorVariants.length && removedImageUrls.length) {
      const nextImages = [];
      const nextPublic = [];
      currentImages.forEach((url, idx) => {
        if (removedImageUrls.includes(url)) {
          const pid = currentPublicIds[idx] || extractPublicId(url);
          if (pid) {
            deleteFromCloudinary(pid).catch((err) =>
              console.warn("Failed to delete removed image:", pid, err.message)
            );
          }
        } else {
          nextImages.push(url);
          if (currentPublicIds[idx]) nextPublic.push(currentPublicIds[idx]);
        }
      });
      currentImages = nextImages;
      currentPublicIds = nextPublic;
    }

    // validate media constraints based on target status
    const targetStatus = status || product.status || "draft";
    const plannedImageCount = colorVariants.length
      ? colorVariants[0].imageCount || 0
      : imageFiles.length > 0
      ? imageFiles.length
      : currentImages.length;
    const plannedVideoCount = colorVariants.length
      ? colorVariants[0].hasVideo
        ? 1
        : 0
      : videoFile
      ? 1
      : removeVideoFlag
      ? 0
      : product.video_url
      ? 1
      : 0;
    const mediaError = validateMediaRules({
      status: targetStatus,
      imagesCount: plannedImageCount,
      videoCount: plannedVideoCount,
    });
    if (mediaError) {
      return res.status(400).json({ status: false, message: mediaError });
    }

    if (targetStatus === "published") {
      if (
        !(name ?? product.name) ||
        !(price ?? product.price) ||
        !(selling_price ?? product.selling_price) ||
        !(quantity ?? product.quantity) ||
        !(sku ?? product.sku)
      ) {
        return res.status(400).json({
          status: false,
          message: "name, price, selling_price, quantity, sku are required to publish",
        });
      }
    }

    let imageUrls = currentImages;
    let publicIds = currentPublicIds;
    let videoUrl = product.video_url;
    let videoPublicId = product.video_public_id;

    if (!colorVariants.length) {
      if (imageFiles.length > 0) {
        for (const pid of publicIds) {
          try {
            await deleteFromCloudinary(pid);
          } catch (err) {
            console.warn("Failed to delete old image:", pid, err.message);
          }
        }
        imageUrls = [];
        publicIds = [];
        for (const file of imageFiles) {
          const uploadRes = await uploadToCloudinary(
            file.buffer,
            `${product.product_id}-${file.originalname}`,
            file.mimetype
          );
          imageUrls.push(uploadRes.secure_url);
          publicIds.push(uploadRes.public_id);
        }
      } else if (req.body.removeImages === "true" || (removedImageUrls.length && imageFiles.length === 0)) {
        for (const pid of publicIds) {
          try {
            await deleteFromCloudinary(pid);
          } catch (err) {
            console.warn("Failed to delete old image:", pid, err.message);
          }
        }
        imageUrls = [];
        publicIds = [];
      }

      if (videoFile) {
        if (videoPublicId) {
          try {
            await deleteFromCloudinary(videoPublicId);
          } catch (err) {
            console.warn("Failed to delete old video:", videoPublicId, err.message);
          }
        }
        const uploadRes = await uploadToCloudinary(
          videoFile.buffer,
          `${product.product_id}-${videoFile.originalname}`,
          videoFile.mimetype
        );
        videoUrl = uploadRes.secure_url;
        videoPublicId = uploadRes.public_id;
      } else if (removeVideoFlag) {
        if (videoPublicId) {
          try {
            await deleteFromCloudinary(videoPublicId);
          } catch (err) {
            console.warn("Failed to delete old video:", videoPublicId, err.message);
          }
        }
        videoUrl = "";
        videoPublicId = "";
      }
    }

    product.title = title ?? product.title;
    product.name = name ?? product.name;
    if (price !== undefined) product.price = Number(price);
    if (selling_price !== undefined) product.selling_price = Number(selling_price);
    if (quantity !== undefined) product.quantity = Number(quantity);
    product.sku = sku ?? product.sku;
    product.description = description ?? product.description;
    product.selling_price_link = selling_price_link ?? product.selling_price_link;
    product.catagory_id = categoryData._id;
    product.product_image = imageUrls;
    product.image_public_ids = publicIds;
    product.specifications = specsArr;
    product.key_highlights = highlightsArr;
    product.video_url = videoUrl;
    product.video_public_id = videoPublicId;
    if (colorVariants.length) {
      if (product.image_public_ids?.length) {
        for (const pid of product.image_public_ids) {
          deleteFromCloudinary(pid).catch(() => {});
        }
      }
      if (product.video_public_id) {
        deleteFromCloudinary(product.video_public_id).catch(() => {});
      }
      let imgPtr = 0;
      let vidPtr = 0;
      for (const cv of colorVariants) {
        const imgs = variantImageFiles.slice(imgPtr, imgPtr + (cv.imageCount || 0));
        const vid = variantVideoFiles[vidPtr] || null;
        let uploaded = { images: [], video: "" };
        if (imgs.length || vid) {
          uploaded = await uploadVariantMedia({
            productId: product.product_id,
            color: cv.color,
            images: imgs,
            video: vid,
          });
        }
        cv.images = imgs.length ? uploaded.images : cv.images || [];
        cv.video = vid ? uploaded.video : cv.video || "";
        imgPtr += cv.imageCount || 0;
        if (vid) vidPtr += 1;
      }
      applyColorVariantsToDoc(product, colorVariants);
    } else {
      if (colors !== undefined) product.colors = parseArrayField(colors);
      if (sizes !== undefined) product.sizes = parseArrayField(sizes);
    }
    if (status) product.status = status;
    if (draft_stage) product.draft_stage = draft_stage;

    await product.save();

    res
      .status(200)
      .json({ status: true, message: "Product updated successfully", product });
  } catch (error) {
    console.error("updateProduct error:", error);
    res
      .status(500)
      .json({ status: false, message: "Server error", error: error.message });
  }
};

const getProducts = async (_req, res) => {
  try {
    const products = await Products.find({})
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

  const searchProducts = async (req, res) => {
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

const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId)
      return res
        .status(404)
        .json({ status: false, Message: "Cannot remove product." });

    const product = await Products.findOne({ product_id: Number(productId) });
    if (!product) {
      return res
        .status(404)
        .json({ status: false, Message: "Product not found" });
    }

    const publicIds = product.image_public_ids?.length
      ? product.image_public_ids
      : product.product_image
          .map((url) => extractPublicId(url))
          .filter(Boolean);

    for (const pid of publicIds) {
      try {
        await deleteFromCloudinary(pid);
      } catch (err) {
        console.warn("Error removing image:", pid, err.message);
      }
    }

    if (product.video_public_id) {
      try {
        await deleteFromCloudinary(product.video_public_id);
      } catch (err) {
        console.warn("Error removing video:", product.video_public_id, err.message);
      }
    }

    await product.deleteOne();

    res
      .status(200)
      .json({ status: true, Message: "Product Deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, Message: "Something went wrong" });
  }
};

const getDrafts = async (_req, res) => {
  try {
    const drafts = await DraftProducts.find({}).sort({ updatedAt: -1 });
    return res.status(200).json({ status: true, drafts });
  } catch (error) {
    console.error("getDrafts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const updateDraft = async (req, res) => {
  const { draft_id } = req.params;
  const files = normalizeFiles(req.files);
  const imageFiles = files.images || [];
  const videoFile = files.video?.[0];
  const variantImageFiles = files.variantImages || [];
  const variantVideoFiles = files.variantVideos || [];
  const removedImageUrls = parseArrayField(req.body.removedImageUrls || req.body.removed_image_urls);
  const removeVideoFlag = req.body.removeVideo === "true";
  const {
    name,
    price,
    quantity,
    sku,
    description,
    catagory,
    categoryId,
    specification,
    selling_price,
    selling_price_link,
    key_highlights,
    colors,
    sizes,
    status: rawStatus,
    draft_stage,
    colorVariants: rawColorVariants,
  } = req.body;
  const colorVariants = parseColorVariants(rawColorVariants || req.body.color_variants);

  try {
    const draft = await DraftProducts.findOne({ draft_id: Number(draft_id) });
    if (!draft) return res.status(404).json({ status: false, message: "Draft not found" });

    const targetStatus = rawStatus ? rawStatus.toLowerCase() : draft.status || "draft";

    const providedCategoryId = categoryId || req.body.catagory_id;
    let categoryData = null;
    if (providedCategoryId) categoryData = await Catagories.findById(providedCategoryId);
    if (!categoryData && catagory) categoryData = await Catagories.findOne({ name: catagory.trim() });
    if (!categoryData) {
      return res.status(400).json({ status: false, message: "Valid categoryId is required" });
    }

    let specsArr = draft.specifications || [];
    let highlightsArr = draft.key_highlights || [];
    if (specification) {
      try {
        const parsed = JSON.parse(specification);
        specsArr = Object.entries(parsed).map(([key, value]) => ({
          key,
          value,
        }));
      } catch {
        return res.status(400).json({ message: "Invalid specification JSON" });
      }
    }
    if (key_highlights) {
      highlightsArr = parseHighlights(key_highlights);
      if (highlightsArr.length < 6 || highlightsArr.length > 10) {
        return res.status(400).json({
          status: false,
          message: "key_highlights must have 6-10 items",
        });
      }
    }

    if (colorVariants.length) {
      let imgPtr = 0;
      let vidPtr = 0;
      colorVariants.forEach((cv) => {
        if (!cv.imageCount) cv.imageCount = Number(cv.images?.length || 0);
        if (cv.imageCount === 0) {
          const remaining = variantImageFiles.length - imgPtr;
          cv.imageCount = remaining > 0 ? remaining : 0;
        }
        if (!cv.hasVideo) {
          cv.hasVideo = !!cv.video || !!variantVideoFiles[vidPtr];
          vidPtr += cv.hasVideo ? 1 : 0;
        }
        imgPtr += cv.imageCount || 0;
      });
      const cvError = validateColorVariants(colorVariants);
      if (cvError) {
        return res.status(400).json({ status: false, message: cvError });
      }
    }

    // validate media constraints against planned state
    let currentImages = draft.product_image || [];
    let currentPublic = draft.image_public_ids || [];
    if (!colorVariants.length && removedImageUrls.length) {
      const nextImages = [];
      const nextPublic = [];
      currentImages.forEach((url, idx) => {
        if (removedImageUrls.includes(url)) {
          const pid = currentPublic[idx] || extractPublicId(url);
          if (pid) {
            deleteFromCloudinary(pid).catch((err) =>
              console.warn("Failed to delete removed image:", pid, err.message)
            );
          }
        } else {
          nextImages.push(url);
          if (currentPublic[idx]) nextPublic.push(currentPublic[idx]);
        }
      });
      currentImages = nextImages;
      currentPublic = nextPublic;
    }

    const plannedImageCount = colorVariants.length
      ? colorVariants[0].imageCount || 0
      : imageFiles.length > 0
      ? imageFiles.length
      : currentImages.length;
    const plannedVideoCount = colorVariants.length
      ? colorVariants[0].hasVideo
        ? 1
        : 0
      : videoFile
      ? 1
      : removeVideoFlag
      ? 0
      : draft.video_url
      ? 1
      : 0;
    const mediaError = validateMediaRules({
      status: targetStatus,
      imagesCount: plannedImageCount,
      videoCount: plannedVideoCount,
    });
    if (mediaError) {
      return res.status(400).json({ status: false, message: mediaError });
    }

    let imageUrls = currentImages;
    let publicIds = currentPublic;
    let videoUrl = draft.video_url;
    let videoPublicId = draft.video_public_id;

    if (!colorVariants.length) {
      if (imageFiles.length > 0) {
        for (const pid of publicIds) {
          try {
            await deleteFromCloudinary(pid);
          } catch (err) {
            console.warn("Failed to delete old image:", pid, err.message);
          }
        }
        imageUrls = [];
        publicIds = [];
        for (const file of imageFiles) {
          const uploadRes = await uploadToCloudinary(
            file.buffer,
            `draft-${draft.draft_id}-${file.originalname}`,
            file.mimetype
          );
          imageUrls.push(uploadRes.secure_url);
          publicIds.push(uploadRes.public_id);
        }
      } else if (req.body.removeImages === "true" || (removedImageUrls.length && imageFiles.length === 0)) {
        // clear images if frontend indicates removal without replacement
        for (const pid of publicIds) {
          try {
            await deleteFromCloudinary(pid);
          } catch (err) {
            console.warn("Failed to delete old image:", pid, err.message);
          }
        }
        imageUrls = [];
        publicIds = [];
      }

      if (videoFile) {
        if (videoPublicId) {
          try {
            await deleteFromCloudinary(videoPublicId);
          } catch (err) {
            console.warn("Failed to delete old video:", videoPublicId, err.message);
          }
        }
        const uploadRes = await uploadToCloudinary(
          videoFile.buffer,
          `draft-${draft.draft_id}-${videoFile.originalname}`,
          videoFile.mimetype
        );
        videoUrl = uploadRes.secure_url;
        videoPublicId = uploadRes.public_id;
      } else if (removeVideoFlag) {
        if (videoPublicId) {
          try {
            await deleteFromCloudinary(videoPublicId);
          } catch (err) {
            console.warn("Failed to delete old video:", videoPublicId, err.message);
          }
        }
        videoUrl = "";
        videoPublicId = "";
      }
    }

    draft.name = name ?? draft.name;
    if (price !== undefined) draft.price = Number(price);
    if (selling_price !== undefined) draft.selling_price = Number(selling_price);
    if (quantity !== undefined) draft.quantity = Number(quantity);
    draft.sku = sku ?? draft.sku;
    draft.description = description ?? draft.description;
    draft.selling_price_link = selling_price_link ?? draft.selling_price_link;
    draft.catagory_id = categoryData._id;
    draft.product_image = imageUrls;
    draft.image_public_ids = publicIds;
    draft.specifications = specsArr;
    draft.key_highlights = highlightsArr;
    draft.video_url = videoUrl;
    draft.video_public_id = videoPublicId;
    if (colorVariants.length) {
      // remove stored media public ids when switching to variant uploads
      if (draft.image_public_ids?.length) {
        for (const pid of draft.image_public_ids) {
          deleteFromCloudinary(pid).catch(() => {});
        }
      }
      if (draft.video_public_id) {
        deleteFromCloudinary(draft.video_public_id).catch(() => {});
      }
      let imgPtr = 0;
      let vidPtr = 0;
      for (const cv of colorVariants) {
        const imgs = variantImageFiles.slice(imgPtr, imgPtr + (cv.imageCount || 0));
        const vid = variantVideoFiles[vidPtr] || null;
        let uploaded = { images: [], video: "" };
        if (imgs.length || vid) {
          uploaded = await uploadVariantMedia({
            productId: `draft-${draft.draft_id}`,
            color: cv.color,
            images: imgs,
            video: vid,
          });
        }
        cv.images = imgs.length ? uploaded.images : cv.images || [];
        cv.video = vid ? uploaded.video : cv.video || "";
        imgPtr += cv.imageCount || 0;
        if (vid) vidPtr += 1;
      }
      applyColorVariantsToDoc(draft, colorVariants);
    }
    if (draft_stage) draft.draft_stage = draft_stage;
    draft.status = targetStatus;

    if (targetStatus === "published") {
      if (!draft.name || !draft.price || !draft.selling_price || !draft.quantity || !draft.sku) {
        return res.status(400).json({
          status: false,
          message: "name, price, selling_price, quantity, sku are required to publish",
        });
      }
      if (draft.colorVariants?.length) {
        const cvErr = validateColorVariants(draft.colorVariants);
        if (cvErr) {
          return res.status(400).json({ status: false, message: cvErr });
        }
      } else {
        if (draft.product_image.length < 5 || draft.product_image.length > 10) {
          return res.status(400).json({ status: false, message: "Publish requires 5-10 images" });
        }
        if (!draft.video_url) {
          return res.status(400).json({ status: false, message: "Publish requires exactly one video" });
        }
      }
      const productId = await getNextSequence("product_id");
      const product = new Products({
        product_id: productId,
        title: draft.title,
        name: draft.name,
        price: draft.price,
        selling_price: draft.selling_price,
        description: draft.description,
        selling_price_link: draft.selling_price_link,
        product_image: draft.product_image,
        image_public_ids: draft.image_public_ids,
        video_url: draft.video_url,
        video_public_id: draft.video_public_id,
        quantity: draft.quantity,
        sku: draft.sku,
        catagory_id: draft.catagory_id,
        specifications: draft.specifications,
        key_highlights: draft.key_highlights,
        colors: draft.colors,
        sizes: draft.sizes,
        status: "published",
        draft_stage: "complete",
      });
      if (draft.colorVariants?.length) {
        applyColorVariantsToDoc(product, draft.colorVariants);
      }
      await product.save();
      await draft.deleteOne();
      return res.status(200).json({ status: true, product, published: true });
    }

    await draft.save();
    return res.status(200).json({ status: true, draft });
  } catch (error) {
    console.error("updateDraft error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const deleteDraft = async (req, res) => {
  const { draft_id } = req.params;
  try {
    const draft = await DraftProducts.findOne({ draft_id: Number(draft_id) });
    if (!draft) return res.status(404).json({ status: false, message: "Draft not found" });

    const publicIds = draft.image_public_ids || [];
    for (const pid of publicIds) {
      try {
        await deleteFromCloudinary(pid);
      } catch (err) {
        console.warn("Error removing image:", pid, err.message);
      }
    }
    if (draft.video_public_id) {
      try {
        await deleteFromCloudinary(draft.video_public_id);
      } catch (err) {
        console.warn("Error removing video:", draft.video_public_id, err.message);
      }
    }
    await draft.deleteOne();
    return res.status(200).json({ status: true, message: "Draft deleted" });
  } catch (error) {
    console.error("deleteDraft error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const renameCategory = async (req, res) => {
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

const deleteCategory = async (req, res) => {
  // business rule: categories are not deletable, only editable/renamable
  return res.status(405).json({
    status: false,
    message: "Category deletion is disabled. Please rename or reuse categories instead.",
  });
};

const getCategoryTree = async (_req, res) => {
  try {
    const categories = await Catagories.find({}).sort({ name: 1 });
    const tree = buildCategoryTree(categories);
    res.status(200).json({ status: true, categories: tree });
  } catch (error) {
    console.error("getCategoryTree error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

const getOrders = async (_req, res) => {
  try {
    const data = await Orders.find({})
      .populate({ path: "items.product", select: "name title product_image price selling_price" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 });

    // return empty list instead of 404 to satisfy frontend
    const ordersWithPayment = data.map((order) => ({
      ...order.toObject(),
      payment_method: order.payment_method || "Razorpay",
    }));
    if (isShiprocketTestMode) {
      const updates = [];
      ordersWithPayment.forEach((order) => {
        const nextStatus = getMockOrderStatus(order.createdAt, order.status);
        if (nextStatus !== order.status) {
          order.status = nextStatus;
          updates.push(Orders.updateOne({ _id: order._id }, { status: nextStatus }));
        }
      });
      if (updates.length) await Promise.all(updates);
    }

    res.status(200).json({
      status: true,
      orders: ordersWithPayment,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const updateOrderStatus = async (req, res) => {
  const { status, order_id, product_id } = req.body;
  if (!status || !order_id) {
    return res
      .status(400)
      .json({ message: "Required fields missing: status or order_id." });
  }

  try {
    const order = await Orders.findOne({ order_id: Number(order_id) });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (status === "confirm") {
      if (!product_id) {
        return res
          .status(400)
          .json({ message: "product_id is required for status 'confirm'." });
      }
      const item = order.items.find(
        (i) => Number(i.product_id) === Number(product_id)
      );
      if (!item) {
        return res
          .status(404)
          .json({ message: "Product not found in this order." });
      }
      const product = await Products.findOne({
        product_id: Number(product_id),
      });
      if (!product || product.quantity < item.quantity) {
        return res
          .status(400)
          .json({ status: false, message: "Insufficient stock." });
      }
      product.quantity = product.quantity - item.quantity;
      await product.save();
      order.payment_status = "paid";
    }

    order.status = status;
    await order.save();

    return res.status(200).json({ message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const login = (req, res) => {
  const { userName, password } = req.body;
  if (!userName || !password) {
    return res.status(400).json({ msg: "userName and Password required" });
  }

  const checkUserName = process.env.ADMIN_USERNAME;
  const checkPassword = process.env.PASSWORD;
  if (checkUserName === userName && checkPassword === password) {
    return res.status(200).json({ status: true, msg: "Login successfull" });
  } else {
    return res.status(401).json({ status: false, msg: "Can't login" });
  }
};

const getCategories = async (_req, res) => {
  // backwards compatibility alias to the tree endpoint
  return getCategoryTree(_req, res);
};

// ---------- Top products ----------
const topProducts = async (_req, res) => {
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

    const products = await Products.find({ product_id: { $in: topIds } })
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
const validateBannerPayload = ({ imageUrl, targetUrl, width, height }) => {
  if (!imageUrl || !targetUrl) {
    return "Image and target URL are required.";
  }
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (w && h && w <= h) {
    return "Banner must be landscape (width should be greater than height).";
  }
  return null;
};

const createBanner = async (req, res) => {
  try {
    const { imageUrl, targetUrl, title, width, height, order = 0, isActive = true } = req.body;

    let resolvedImageUrl = imageUrl?.trim();
    let imagePublicId = "";

    if (req.file) {
      const uploadRes = await uploadToCloudinary(
        req.file.buffer,
        `banner-${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );
      resolvedImageUrl = uploadRes.secure_url;
      imagePublicId = uploadRes.public_id;
    }

    const validationError = validateBannerPayload({
      imageUrl: resolvedImageUrl,
      targetUrl,
      width,
      height,
    });
    if (validationError) {
      return res.status(400).json({ status: false, message: validationError });
    }

    const banner = await Banner.create({
      title: title?.trim(),
      imageUrl: resolvedImageUrl.trim(),
      imagePublicId,
      targetUrl: targetUrl.trim(),
      width: width ? Number(width) : 1200,
      height: height ? Number(height) : 675,
      order: Number(order) || 0,
      isActive,
    });
    res.status(201).json({ status: true, banner });
  } catch (error) {
    console.error("createBanner error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const getBannersAdmin = async (_req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.status(200).json({ status: true, banners });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const getBannersPublic = async (_req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(10);
    res.status(200).json({ status: true, banners });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    const existing = await Banner.findById(id);
    if (!existing) return res.status(404).json({ status: false, message: "Banner not found" });

    let newImageUrl = payload.imageUrl ? payload.imageUrl.trim() : existing.imageUrl;
    let newPublicId = existing.imagePublicId;

    if (req.file) {
      const uploadRes = await uploadToCloudinary(
        req.file.buffer,
        `banner-${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );
      newImageUrl = uploadRes.secure_url;
      newPublicId = uploadRes.public_id;
      if (existing.imagePublicId) {
        deleteFromCloudinary(existing.imagePublicId);
      } else if (existing.imageUrl) {
        const pid = extractPublicId(existing.imageUrl);
        if (pid) deleteFromCloudinary(pid);
      }
    }

    const merged = {
      title: payload.title !== undefined ? payload.title : existing.title,
      imageUrl: newImageUrl,
      imagePublicId: newPublicId,
      targetUrl: payload.targetUrl ? payload.targetUrl.trim() : existing.targetUrl,
      width: payload.width ? Number(payload.width) : existing.width || 1200,
      height: payload.height ? Number(payload.height) : existing.height || 675,
      order: payload.order != null ? Number(payload.order) : existing.order || 0,
      isActive: payload.isActive !== undefined ? payload.isActive : existing.isActive,
    };

    const validationError = validateBannerPayload(merged);
    if (validationError) {
      return res.status(400).json({ status: false, message: validationError });
    }

    const updated = await Banner.findByIdAndUpdate(id, merged, { new: true });
    if (!updated) return res.status(404).json({ status: false, message: "Banner not found" });
    res.status(200).json({ status: true, banner: updated });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Banner.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Banner not found" });
    if (deleted.imagePublicId) {
      deleteFromCloudinary(deleted.imagePublicId);
    } else if (deleted.imageUrl) {
      const pid = extractPublicId(deleted.imageUrl);
      if (pid) deleteFromCloudinary(pid);
    }
    res.status(200).json({ status: true, message: "Banner deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

export {
  getProducts,
  updateProduct,
  createCategory,
  uploadProduct,
  createDraftProduct,
  updateDraft,
  getDrafts,
  deleteDraft,
  login,
  getOrders,
  updateOrderStatus,
  deleteProduct,
  renameCategory,
  deleteCategory,
  getCategories,
  getCategoryTree,
  searchProducts,
  topProducts,
  createBanner,
  getBannersAdmin,
  getBannersPublic,
  updateBanner,
  deleteBanner,
};
