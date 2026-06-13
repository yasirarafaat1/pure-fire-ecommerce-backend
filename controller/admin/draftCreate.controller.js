import { Catagories } from "../../model/catagory.model.js";
import DraftProducts from "../../model/draftProduct.model.js";
import { getNextSequence } from "../../model/counter.model.js";
import * as helpers from "./productHelpers.js";
const { parseArrayField, parseHighlights, parseColorVariants, validateColorVariants, applyColorVariantsToDoc, validateMediaRules, uploadMedia, uploadVariantMedia, stageFromLabel, normalizeFiles } = helpers;
export const createDraftProduct = async (req, res) => {
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
