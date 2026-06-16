import { Catagories } from "../../model/catagory.model.js";
import Products from "../../model/product.model.js";
import DraftProducts from "../../model/draftProduct.model.js";
import { getNextSequence } from "../../model/counter.model.js";
import * as helpers from "./productHelpers.js";
const { parseArrayField, parseHighlights, parseColorVariants, validateColorVariants, applyColorVariantsToDoc, validateMediaRules, uploadMedia, uploadVariantMedia, stageFromLabel, normalizeFiles } = helpers;
export const uploadProduct = async (req, res) => {
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
