import Products from "../../model/product.model.js";
import { Catagories } from "../../model/catagory.model.js";
import { deleteFromCloudinary, extractPublicId } from "../../config/cloudinary.js";
import * as helpers from "./productHelpers.js";
const { parseArrayField, parseHighlights, parseColorVariants, validateColorVariants, applyColorVariantsToDoc, validateMediaRules, uploadMedia, uploadVariantMedia, normalizeFiles } = helpers;
export const updateProduct = async (req, res) => {
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
