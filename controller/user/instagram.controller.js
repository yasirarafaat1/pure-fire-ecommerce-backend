import { listPublicInstagramReels } from "../../services/instagramReels.service.js";

export const getInstagramReels = async (req, res) => {
  try {
    const data = await listPublicInstagramReels({ limit: req.query.limit });
    return res.status(200).json(data);
  } catch (error) {
    console.error("getInstagramReels error:", error);
    return res.status(200).json({ enabled: false, handle: "", reels: [] });
  }
};
