import Products from "../../model/product.model.js"; import DraftProducts from "../../model/draftProduct.model.js";
import { Catagories } from "../../model/catagory.model.js";
import { getNextSequence } from "../../model/counter.model.js";
import { deleteFromCloudinary, extractPublicId, uploadToCloudinary } from "../../config/cloudinary.js";
import * as helpers from "./productHelpers.js";
const { parseArrayField, parseHighlights, parseColorVariants, validateColorVariants, applyColorVariantsToDoc, validateMediaRules, uploadMedia, uploadVariantMedia, normalizeFiles, resolveVariantImageOrder } = helpers;

const collectVariantMedia = (variants = []) => {
  const images = new Set();
  const videos = new Set();
  variants.forEach((variant) => {
    (variant.images || []).forEach((url) => {
      if (url) images.add(url);
    });
    if (variant.video) videos.add(variant.video);
  });
  return { images, videos };
};

const cleanupRemovedCloudMedia = (previousUrls, nextUrls, label) => {
  previousUrls.forEach((url) => {
    if (!url || nextUrls.has(url)) return;
    const pid = extractPublicId(url);
    if (!pid) return;
    deleteFromCloudinary(pid).catch((err) =>
      console.warn(`Failed to delete removed ${label}:`, pid, err.message)
    );
  });
};

export const updateDraft = async (req, res) => {
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
    const previousVariantMedia = collectVariantMedia(draft.colorVariants || []);
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
        cv.imageCount = Number.isFinite(cv.imageCount) ? cv.imageCount : 0;
        if (cv.imageCount === 0 && !(cv.images?.length)) {
          const remaining = variantImageFiles.length - imgPtr;
          cv.imageCount = remaining > 0 ? remaining : 0;
        }
        if (!cv.hasVideo) {
          cv.hasVideo = !!cv.video || !!variantVideoFiles[vidPtr];
          vidPtr += cv.hasVideo ? 1 : 0;
        }
        imgPtr += cv.imageCount || 0;
      });
      const cvError = targetStatus === "published" ? validateColorVariants(colorVariants) : null;
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
      ? (colorVariants[0].images?.length || 0) + (colorVariants[0].imageCount || 0)
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
      } else if (req.body.removeImages === "true") {
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
        cv.images = resolveVariantImageOrder(cv, imgs.length ? uploaded.images : []);
        cv.video = vid ? uploaded.video : cv.video || "";
        imgPtr += cv.imageCount || 0;
        if (vid) vidPtr += 1;
      }
      applyColorVariantsToDoc(draft, colorVariants);
      const nextVariantMedia = collectVariantMedia(colorVariants);
      cleanupRemovedCloudMedia(previousVariantMedia.images, nextVariantMedia.images, "draft variant image");
      cleanupRemovedCloudMedia(previousVariantMedia.videos, nextVariantMedia.videos, "draft variant video");
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
