import Reviews from "../../model/review.model.js";
import Products from "../../model/product.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";
import { writeAdminAudit } from "../../utils/adminAudit.js";

export const listReviews = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const q = String(req.query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ user: regex }, { comment: regex }, { review_title: regex }];
  }
  const [reviews, total] = await Promise.all([
    Reviews.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Reviews.countDocuments(filter),
  ]);
  const productIds = [...new Set(reviews.map((review) => review.product_id))];
  const products = await Products.find({ product_id: { $in: productIds } })
    .select("product_id name slug")
    .lean();
  const productMap = new Map(products.map((product) => [product.product_id, product]));
  const data = reviews.map((review) => ({
    ...review,
    product: productMap.get(review.product_id) || null,
  }));
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const moderateReview = async (req, res) => {
  const status = String(req.body?.status || "").toUpperCase();
  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ status: false, message: "Invalid review status" });
  }
  const review = await Reviews.findByIdAndUpdate(
    req.params.id,
    { status, moderatedAt: new Date(), moderatedBy: req.admin._id },
    { new: true, runValidators: true }
  ).lean();
  if (!review) return res.status(404).json({ status: false, message: "Review not found" });
  await writeAdminAudit(req, {
    action: status === "APPROVED" ? "REVIEW_APPROVED" : "REVIEW_REJECTED",
    entityType: "REVIEW",
    entityId: review._id,
    metadata: { productId: review.product_id },
  });
  return res.json({ status: true, data: review });
};

export const deleteReview = async (req, res) => {
  const review = await Reviews.findByIdAndDelete(req.params.id);
  if (!review) return res.status(404).json({ status: false, message: "Review not found" });
  await writeAdminAudit(req, {
    action: "REVIEW_DELETED",
    entityType: "REVIEW",
    entityId: review._id,
    metadata: { productId: review.product_id },
  });
  return res.json({ status: true, message: "Review deleted" });
};
