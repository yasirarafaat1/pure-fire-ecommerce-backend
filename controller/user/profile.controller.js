import Profile from "../../model/profile.model.js";
import Wishlist from "../../model/wishlist.model.js";
import Products from "../../model/product.model.js";
export const getUserProfile = async (req, res) => {
  try {
    const email = req.user?.email || req.body?.email || "user@example.com";
    const profile =
      (await Profile.findOne({ email }).lean()) || { email, name: "", gender: "" };
    return res.status(200).json({ status: true, profile });
  } catch (error) {
    console.error("getUserProfile error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to load profile" });
  }
};
export const updateUserProfile = async (req, res) => {
  try {
    const { name = "", gender = "" } = req.body || {};
    const email = req.user?.email || req.body?.email || "user@example.com";
    const profile = await Profile.findOneAndUpdate(
      { email },
      { email, name, gender },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.status(200).json({ status: true, profile });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to update profile" });
  }
};

// --- Wishlist helpers ---
const requireEmail = (req, res) => {
  const email = (req.user?.email || req.body?.email || "").trim();
  if (!email) {
    res.status(401).json({ status: false, message: "Email required (auth)" });
    return null;
  }
  return email;
};
export const listWishlist = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const items = await Wishlist.find({ email }).lean();
    const ids = items.map((i) => i.product_id);
    const products = await Products.find({ product_id: { $in: ids } }).lean();
    return res.status(200).json({ status: true, products });
  } catch (error) {
    console.error("listWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to load wishlist" });
  }
};
export const addToWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    await Wishlist.updateOne(
      { email, product_id: pid },
      { $set: { email, product_id: pid } },
      { upsert: true }
    );
    return listWishlist(req, res);
  } catch (error) {
    console.error("addToWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to add to wishlist" });
  }
};
export const removeFromWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    await Wishlist.deleteOne({ email, product_id: pid });
    return listWishlist(req, res);
  } catch (error) {
    console.error("removeFromWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to remove from wishlist" });
  }
};
export const clearWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    await Wishlist.deleteMany({ email });
    return res.status(200).json({ status: true, products: [] });
  } catch (error) {
    console.error("clearWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to clear wishlist" });
  }
};

// --- Orders (stub) ---
