import Coupon from "../../model/coupon.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

const couponPayload = (body) => ({
  code: String(body.code || "").trim().toUpperCase(),
  discountType: String(body.discountType || "").toUpperCase(),
  discountValue: Number(body.discountValue),
  minimumOrderAmount: Number(body.minimumOrderAmount) || 0,
  maxDiscountAmount: Number(body.maxDiscountAmount) || 0,
  usageLimit: Number(body.usageLimit) || 0,
  perCustomerLimit: Number(body.perCustomerLimit) || 0,
  startsAt: body.startsAt ? new Date(body.startsAt) : null,
  endsAt: body.endsAt ? new Date(body.endsAt) : null,
  status: body.status === "DISABLED" ? "DISABLED" : "ACTIVE",
});

const validate = (payload) => {
  if (!/^[A-Z0-9_-]{3,30}$/.test(payload.code)) return "Invalid coupon code";
  if (!["PERCENTAGE", "FIXED"].includes(payload.discountType)) return "Invalid discount type";
  if (!Number.isFinite(payload.discountValue) || payload.discountValue <= 0) {
    return "Discount value must be positive";
  }
  if (payload.discountType === "PERCENTAGE" && payload.discountValue > 100) {
    return "Percentage discount cannot exceed 100";
  }
  if (payload.startsAt && payload.endsAt && payload.endsAt <= payload.startsAt) {
    return "End date must be after start date";
  }
  return "";
};

export const listCoupons = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.code = new RegExp(escapeRegex(req.query.q), "i");
  const [data, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Coupon.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const createCoupon = async (req, res) => {
  const payload = couponPayload(req.body || {});
  const error = validate(payload);
  if (error) return res.status(400).json({ status: false, message: error });
  const coupon = await Coupon.create(payload);
  return res.status(201).json({ status: true, data: coupon });
};

export const updateCoupon = async (req, res) => {
  const payload = couponPayload(req.body || {});
  const error = validate(payload);
  if (error) return res.status(400).json({ status: false, message: error });
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, payload, {
    new: true,
    runValidators: true,
  }).lean();
  if (!coupon) return res.status(404).json({ status: false, message: "Coupon not found" });
  return res.json({ status: true, data: coupon });
};

export const deleteCoupon = async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return res.status(404).json({ status: false, message: "Coupon not found" });
  return res.json({ status: true, message: "Coupon deleted" });
};
