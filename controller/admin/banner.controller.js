import Banner from "../../model/banner.model.js";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicId } from "../../config/cloudinary.js";
export const validateBannerPayload = ({ imageUrl, targetUrl, width, height }) => {
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
export const createBanner = async (req, res) => {
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
export const getBannersAdmin = async (_req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.status(200).json({ status: true, banners });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};
export const getBannersPublic = async (_req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(10);
    res.status(200).json({ status: true, banners });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};
export const updateBanner = async (req, res) => {
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
export const deleteBanner = async (req, res) => {
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
