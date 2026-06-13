import { uploadToCloudinary } from "../../config/cloudinary.js";
export const parseArrayField = (value) => {
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
export const parseHighlights = (value) => {
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
export const parseColorVariants = (value) => {
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
export const validateColorVariants = (cvs) => {
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
export const applyColorVariantsToDoc = (doc, cvs) => {
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
export const validateMediaRules = ({ status, imagesCount, videoCount }) => {
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
export const uploadMedia = async ({ productId, images = [], video }) => {
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
export const uploadVariantMedia = async ({ productId, color, images = [], video }) => {
  const safeColor = (color || "color").replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = safeColor ? `${productId}-${safeColor}` : `${productId}-color`;
  const imgResult = await uploadMedia({ productId: prefix, images, video });
  return { images: imgResult.imageUrls, video: imgResult.videoUrl };
};
export const stageFromLabel = (label = "") => {
  const l = label.toLowerCase();
  if (l.includes("pricing")) return "pricing";
  if (l.includes("media")) return "media";
  if (l.includes("detail")) return "details";
  if (l.includes("complete")) return "complete";
  return "category";
};
export const normalizeFiles = (files) => {
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
