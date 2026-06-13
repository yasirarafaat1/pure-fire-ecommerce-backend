import DraftProducts from "../../model/draftProduct.model.js";
import { deleteFromCloudinary, extractPublicId } from "../../config/cloudinary.js";
export const getDrafts = async (_req, res) => {
  try {
    const drafts = await DraftProducts.find({}).sort({ updatedAt: -1 });
    return res.status(200).json({ status: true, drafts });
  } catch (error) {
    console.error("getDrafts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
export const deleteDraft = async (req, res) => {
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
