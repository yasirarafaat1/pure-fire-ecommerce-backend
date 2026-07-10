import Coupon from "../../model/coupon.model.js";
import { Catagories } from "../../model/catagory.model.js";
import Products from "../../model/product.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

const objectIdPattern = /^[a-f\d]{24}$/i;
const targetScopes = ["ALL_PRODUCTS", "SELECTED_PRODUCTS", "SELECTED_CATEGORIES"];
const timerTypes = ["FIXED_WINDOW", "ONE_TIME", "LOOP"];

const uniqueNumbers = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );

const uniqueObjectIds = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item || "").trim())
        .filter((item) => objectIdPattern.test(item))
    )
  );

const dateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const couponTargetPayload = (body) => {
  const target = body.target || {};
  const scope = targetScopes.includes(target.scope) ? target.scope : "ALL_PRODUCTS";
  return {
    scope,
    productIds: scope === "SELECTED_PRODUCTS" ? uniqueNumbers(target.productIds) : [],
    categoryIds: scope === "SELECTED_CATEGORIES" ? uniqueObjectIds(target.categoryIds) : [],
  };
};

const couponTimerPayload = (body) => {
  const timer = body.timer || {};
  const enabled = Boolean(timer.enabled);
  const type = timerTypes.includes(timer.type) ? timer.type : "FIXED_WINDOW";
  return {
    enabled,
    type,
    startAt: enabled ? dateOrNull(timer.startAt) : null,
    endAt: enabled && type === "FIXED_WINDOW" ? dateOrNull(timer.endAt) : null,
    durationMinutes: enabled && type !== "FIXED_WINDOW" ? Math.max(0, Number(timer.durationMinutes) || 0) : 0,
  };
};

const couponPayload = (body) => ({
  code: String(body.code || "").trim().toUpperCase(),
  description: String(body.description || "").trim(),
  discountType: String(body.discountType || "").toUpperCase(),
  discountValue: Number(body.discountValue),
  minimumOrderAmount: Number(body.minimumOrderAmount) || 0,
  maxDiscountAmount: Number(body.maxDiscountAmount) || 0,
  usageLimit: Number(body.usageLimit) || 0,
  perCustomerLimit: Number(body.perCustomerLimit) || 0,
  startsAt: body.startsAt ? new Date(body.startsAt) : null,
  endsAt: body.endsAt ? new Date(body.endsAt) : null,
  target: couponTargetPayload(body),
  timer: couponTimerPayload(body),
  status: body.status === "DISABLED" ? "DISABLED" : "ACTIVE",
});

const validate = (payload) => {
  if (!/^[A-Z0-9_-]{3,30}$/.test(payload.code)) return "Invalid coupon code";
  const wordCount = payload.description ? payload.description.split(/\s+/).filter(Boolean).length : 0;
  if (!wordCount) return "Description is required";
  if (wordCount < 5 || wordCount > 30) {
    return "Description must be between 5 and 30 words";
  }
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
  if (payload.target.scope === "SELECTED_PRODUCTS" && !payload.target.productIds.length) {
    return "Select at least one product for this promo code";
  }
  if (payload.target.scope === "SELECTED_CATEGORIES" && !payload.target.categoryIds.length) {
    return "Select at least one category for this promo code";
  }
  if (payload.timer.enabled) {
    if (!payload.timer.startAt) return "Timer start date and time is required";
    if (payload.timer.type === "FIXED_WINDOW" && !payload.timer.endAt) {
      return "Fixed window timer needs an end date and time";
    }
    if (payload.timer.type === "FIXED_WINDOW" && payload.timer.endAt <= payload.timer.startAt) {
      return "Timer end date must be after start date";
    }
    if (payload.timer.type !== "FIXED_WINDOW" && payload.timer.durationMinutes <= 0) {
      return "Timer duration must be greater than zero";
    }
  }
  return "";
};

const validateReferences = async (payload) => {
  if (payload.target.scope === "SELECTED_PRODUCTS") {
    const count = await Products.countDocuments({ product_id: { $in: payload.target.productIds } });
    if (count !== payload.target.productIds.length) return "One or more selected products are invalid";
  }
  if (payload.target.scope === "SELECTED_CATEGORIES") {
    const count = await Catagories.countDocuments({ _id: { $in: payload.target.categoryIds } });
    if (count !== payload.target.categoryIds.length) return "One or more selected categories are invalid";
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
  const referenceError = await validateReferences(payload);
  if (referenceError) return res.status(400).json({ status: false, message: referenceError });
  const duplicate = await Coupon.exists({ code: payload.code });
  if (duplicate) return res.status(409).json({ status: false, message: "Promo code already exists" });
  const coupon = await Coupon.create(payload);
  return res.status(201).json({ status: true, data: coupon });
};

export const updateCoupon = async (req, res) => {
  const payload = couponPayload(req.body || {});
  const error = validate(payload);
  if (error) return res.status(400).json({ status: false, message: error });
  const referenceError = await validateReferences(payload);
  if (referenceError) return res.status(400).json({ status: false, message: referenceError });
  const duplicate = await Coupon.exists({ code: payload.code, _id: { $ne: req.params.id } });
  if (duplicate) return res.status(409).json({ status: false, message: "Promo code already exists" });
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
