import Products from "../../model/product.model.js";
import { deleteFromCloudinary, extractPublicId } from "../../config/cloudinary.js";
export const deleteProduct = async (req, res) => {
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
