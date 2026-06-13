import Products from "../../model/product.model.js";
import Reviews from "../../model/review.model.js";
import Profile from "../../model/profile.model.js";
import { uploadToCloudinary } from "../../config/cloudinary.js";
export const addProductReview = async (req, res) => {
  try {
    const {
      product_id,
      review_rate,
      review_text,
      review_title,
      user_name,
      email,
      user_email,
    } = req.body || {};

    const pid = Number(product_id);
    const ratingNum = Number(review_rate);
    if (!pid || Number.isNaN(pid)) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ status: false, message: "rating 1-5 required" });
    }

    // Resolve display name priority: profile.name (by email) > provided user_name > email local-part > Anonymous
    const emailVal = (email || user_email || "").trim();
    let displayName = (user_name || "").trim();
    if (!displayName && emailVal) {
      const profile = await Profile.findOne({ email: emailVal }).lean();
      displayName = profile?.name?.trim() || "";
      if (!displayName) {
        displayName = emailVal.split("@")[0] || "";
      }
    }
    if (!displayName) displayName = "Anonymous";

    let imageUrl = "";
    if (req.file && req.file.buffer) {
      try {
        const uploadRes = await uploadToCloudinary(
          req.file.buffer,
          `${pid}-${Date.now()}`,
          req.file.mimetype || "image/jpeg"
        );
        imageUrl = uploadRes.secure_url || uploadRes.url || "";
      } catch (err) {
        console.error("Cloudinary review upload failed:", err);
        return res.status(500).json({ status: false, message: "Image upload failed" });
      }
    }

    const review = await Reviews.create({
      product_id: pid,
      rating: ratingNum,
      comment: review_text || "",
      user: displayName,
      review_title: review_title || "",
      review_image: imageUrl,
    });

    const shaped = {
      id: review._id,
      review_rate: review.rating,
      review_text: review.comment,
      review_title: review.review_title,
      review_image: review.review_image,
      user_name: review.user,
      createdAt: review.createdAt,
    };

    return res.status(201).json({ status: true, review: shaped, message: "Review added" });
  } catch (error) {
    console.error("addProductReview error:", error);
    return res.status(500).json({ status: false, message: "Failed to add review" });
  }
};
export const getProductReviews = async (req, res) => {
  try {
    const pid = Number(req.params.id);
    const reviews = await Reviews.find({ product_id: pid }).sort({
      createdAt: -1,
    });
    const mapped = reviews.map((r) => ({
      id: r._id,
      review_rate: r.rating,
      review_text: r.comment,
      review_title: r.review_title,
      review_image: r.review_image,
      user_name: r.user || "Anonymous",
      createdAt: r.createdAt,
    }));
    return res.status(200).json({ status: true, reviews: mapped });
  } catch (error) {
    console.error("getProductReviews error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// --- Cart API ---
