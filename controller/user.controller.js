import Products from "../model/product.model.js";
import { Catagories } from "../model/catagory.model.js";
import Reviews from "../model/review.model.js";
import Cart from "../model/cart.model.js";
import Addresses from "../model/addresses.model.js";
import { getNextSequence } from "../model/counter.model.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import Profile from "../model/profile.model.js";
import Wishlist from "../model/wishlist.model.js";
import Orders from "../model/orders.model.js";
import {
  createShiprocketShipment,
  getDeliveryEstimate,
  getMockOrderStatus,
  isShiprocketTestMode,
} from "../config/shiprocket.js";
import {
  buildProductSearchFilter,
  filterProductsByColorName,
  pickMatchedColor,
  parseSearchQuery,
  buildTokenRegex,
} from "../utils/search.js";

const parsePageLimit = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(Math.min(parseInt(req.query.limit || "12", 10), 100), 1);
  return { page, limit };
};

export const showProducts = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const total = await Products.countDocuments({});
    const products = await Products.find({})
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: "catagory_id", select: "name parent ancestors" })
      .lean();

    const ids = products.map((p) => p.product_id).filter(Boolean);
    const reviewAgg = ids.length
      ? await Reviews.aggregate([
          { $match: { product_id: { $in: ids } } },
          { $group: { _id: "$product_id", reviewCount: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
        ])
      : [];
    const reviewMap = new Map(reviewAgg.map((r) => [r._id, r]));
    const shaped = products.map((p) => {
      const stats = reviewMap.get(p.product_id) || {};
      return { ...p, reviewCount: stats.reviewCount || 0, avgRating: stats.avgRating || 0 };
    });

    return res.status(200).json({
      status: true,
      products: shaped,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("showProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const idParam = req.params.id;
    const product =
      (await Products.findOne({ product_id: Number(idParam) })) ||
      (await Products.findById(idParam));

    if (!product) {
      return res
        .status(200)
        .json({ status: 404, data: [], message: "Product not found" });
    }
    const cat =
      product.catagory_id &&
      (await Catagories.findById(product.catagory_id).lean());

    const shaped = {
      ...product.toObject(),
      catagory_id: 1, // legacy numeric fallback
      Catagory: cat ? { id: 1, name: cat.name } : undefined,
    };

    return res.status(200).json({ status: 200, data: [shaped] });
  } catch (error) {
    console.error("getProductById error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getProductByCategory = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const categoryName = req.params.category;
    const category = await Catagories.findOne({ name: categoryName });
    if (!category) {
      return res.status(200).json({ status: true, products: [], pagination: { page, limit, total: 0 } });
    }

    const filter = { catagory_id: category._id };
    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      status: true,
      products,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("getProductByCategory error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const payload = req.body || {};
    const query = req.query || {};
    const search = (payload.search || query.search || "").toString();
    const page = payload.page || query.page || 1;
    const limit = payload.limit || query.limit || 12;

    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.max(Math.min(parseInt(limit, 10), 100), 1);

    const parsed = parseSearchQuery(search);
    const categoryTokenMap = new Map();
    if (parsed.textTokens?.length) {
      await Promise.all(
        parsed.textTokens.map(async (token) => {
          const regex = buildTokenRegex(token);
          if (!regex) {
            categoryTokenMap.set(token, []);
            return;
          }
          const cats = await Catagories.find({
            $or: [{ name: regex }, { "ancestors.name": regex }],
          }).select("_id");
          categoryTokenMap.set(
            token,
            cats.map((c) => c._id)
          );
        })
      );
    }
    let categoryIntersection = [];
    if (parsed.textTokens?.length) {
      const allHaveCats = parsed.textTokens.every(
        (token) => (categoryTokenMap.get(token) || []).length
      );
      if (allHaveCats) {
        const sets = parsed.textTokens.map((token) =>
          (categoryTokenMap.get(token) || []).map((id) => String(id))
        );
        categoryIntersection = sets.reduce((acc, curr) => acc.filter((id) => curr.includes(id)));
      }
    }
    let fallbackCategoryIds = [];
    if (search.trim()) {
      const fullRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const cats = await Catagories.find({
        $or: [{ name: fullRegex }, { "ancestors.name": fullRegex }],
      }).select("_id");
      fallbackCategoryIds = cats.map((c) => c._id);
    }

    const { filter } = buildProductSearchFilter(search, {
      parsed,
      categoryTokenMap,
      fallbackCategoryIds,
    });
    if (categoryIntersection.length) {
      if (filter.$and) filter.$and.push({ catagory_id: { $in: categoryIntersection } });
      else filter.catagory_id = { $in: categoryIntersection };
    }
    if (filter.$and) filter.$and.push({ status: "published" });
    else filter.status = "published";

    const total = await Products.countDocuments(filter);
    let products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate({ path: "catagory_id", select: "name parent ancestors" });
    if (parsed.colorNames?.length || parsed.colorHexes?.length) {
      products = filterProductsByColorName(products, parsed.colorNames || [], parsed.colorHexes || []);
      products = products.map((p) => {
        const base = typeof p?.toObject === "function" ? p.toObject() : p;
        return {
          ...base,
          matchedColor: pickMatchedColor(base, parsed.colorNames || [], parsed.colorHexes || []),
        };
      });
    }

    return res.status(200).json({
      status: true,
      products,
      pagination: { page: pageNum, limit: limitNum, total },
    });
  } catch (error) {
    console.error("searchProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getTopProducts = async (_req, res) => {
  try {
    const ordersAgg = await Orders.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.product_id", orderedQty: { $sum: "$items.quantity" }, orderCount: { $sum: 1 } } },
    ]);
    const reviewAgg = await Reviews.aggregate([
      { $group: { _id: "$product_id", reviewCount: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
    ]);
    const wishAgg = await Wishlist.aggregate([
      { $group: { _id: "$product_id", wishCount: { $sum: 1 } } },
    ]);

    const metricsMap = new Map();
    const upsert = (id, data) => {
      const curr =
        metricsMap.get(id) || { orderedQty: 0, orderCount: 0, reviewCount: 0, avgRating: 0, wishCount: 0 };
      metricsMap.set(id, { ...curr, ...data });
    };

    ordersAgg.forEach((o) => upsert(o._id, { orderedQty: o.orderedQty, orderCount: o.orderCount }));
    reviewAgg.forEach((r) => upsert(r._id, { reviewCount: r.reviewCount, avgRating: r.avgRating || 0 }));
    wishAgg.forEach((w) => upsert(w._id, { wishCount: w.wishCount }));

    const scored = [];
    metricsMap.forEach((m, id) => {
      const score = m.orderedQty * 3 + m.orderCount + m.reviewCount * 1.5 + m.wishCount + m.avgRating * 2;
      scored.push({ product_id: id, score, metrics: m });
    });
    scored.sort((a, b) => b.score - a.score);
    const topIds = scored.slice(0, 20).map((s) => s.product_id);

    if (!topIds.length) {
      return res.status(200).json({ status: true, products: [] });
    }

    const products = await Products.find({ product_id: { $in: topIds }, status: "published" }).lean();
    const map = new Map(products.map((p) => [p.product_id, p]));
    const result = scored
      .filter((s) => map.has(s.product_id))
      .map((s) => {
        const prod = map.get(s.product_id);
        return {
          ...prod,
          reviewCount: s.metrics?.reviewCount || 0,
          avgRating: s.metrics?.avgRating || 0,
          orderedQty: s.metrics?.orderedQty || 0,
          orderCount: s.metrics?.orderCount || 0,
          wishCount: s.metrics?.wishCount || 0,
        };
      });

    return res.status(200).json({ status: true, products: result });
  } catch (error) {
    console.error("getTopProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getCategories = async (_req, res) => {
  try {
    const categories = await Catagories.find({}).sort({ name: 1 });
    return res.status(200).json({ status: true, categories });
  } catch (error) {
    console.error("getCategories (user) error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

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
export const getUserCart = async (req, res) => {
  try {
    const cartId = req.body?.cart_id;
    if (!cartId) return res.status(200).json({ status: true, cart_id: "", items: [] });
    const cart = await Cart.findOne({ cart_id: cartId }).lean();
    return res.status(200).json({ status: true, cart_id: cartId, items: cart?.items || [] });
  } catch (error) {
    console.error("getUserCart error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const saveUserCart = async (req, res) => {
  try {
    const { cart_id, items = [] } = req.body || {};
    if (!cart_id) return res.status(400).json({ status: false, message: "cart_id required" });
    const cart = await Cart.findOneAndUpdate(
      { cart_id },
      { $set: { items } },
      { upsert: true, new: true },
    );
    return res.status(200).json({ status: true, cart_id: cart.cart_id, items: cart.items });
  } catch (error) {
    console.error("saveUserCart error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const addToCart = async (req, res) => {
  try {
    const {
      cart_id,
      product_id,
      color = "",
      size = "",
      qty = 1,
      price,
      mrp,
      title,
      image = "",
    } = req.body || {};

    if (!product_id || !price || !mrp || !title) {
      return res.status(400).json({ status: false, message: "Missing product details." });
    }
    const cartId = cart_id || `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const cart = (await Cart.findOne({ cart_id: cartId })) || new Cart({ cart_id: cartId, items: [] });
    const idx = cart.items.findIndex(
      (i) => i.product_id === Number(product_id) && i.color === color && i.size === size,
    );
    if (idx >= 0) {
      cart.items[idx].qty += Number(qty) || 1;
    } else {
      cart.items.push({
        product_id: Number(product_id),
        color,
        size,
        qty: Number(qty) || 1,
        price: Number(price),
        mrp: Number(mrp),
        title,
        image,
      });
    }
    await cart.save();
    return res.status(200).json({ status: true, cart_id: cart.cart_id, items: cart.items });
  } catch (error) {
    console.error("addToCart error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const removeCartByProduct = async (req, res) => {
  try {
    const { cart_id, color = "", size = "" } = req.query || {};
    const productId = req.params.productId;
    if (!cart_id || !productId) return res.status(400).json({ status: false, message: "Missing params" });
    const cart = await Cart.findOne({ cart_id }).lean();
    if (!cart) return res.status(200).json({ status: true, cart_id, items: [] });
    const items = (cart.items || []).filter(
      (i) => !(String(i.product_id) === String(productId) && i.color === color && i.size === size),
    );
    const updated = await Cart.findOneAndUpdate({ cart_id }, { $set: { items } }, { new: true });
    return res.status(200).json({ status: true, cart_id, items: updated?.items || [] });
  } catch (error) {
    console.error("removeCartByProduct error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const { cart_id, product_id, color = "", size = "", qty } = req.body || {};
    if (!cart_id || !product_id) return res.status(400).json({ status: false, message: "Missing params" });
    const cart = await Cart.findOne({ cart_id });
    if (!cart) return res.status(200).json({ status: true, cart_id, items: [] });
    const idx = cart.items.findIndex(
      (i) => i.product_id === Number(product_id) && i.color === color && i.size === size,
    );
    if (idx >= 0) {
      const q = Number(qty);
      if (q <= 0) cart.items.splice(idx, 1);
      else cart.items[idx].qty = q;
      await cart.save();
    }
    return res.status(200).json({ status: true, cart_id, items: cart.items });
  } catch (error) {
    console.error("updateCartItem error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const clearCart = async (req, res) => {
  try {
    const { cart_id } = req.body || {};
    if (!cart_id) return res.status(400).json({ status: false, message: "cart_id required" });
    const cart = await Cart.findOneAndUpdate({ cart_id }, { $set: { items: [] } }, { new: true });
    return res.status(200).json({ status: true, cart_id, items: cart?.items || [] });
  } catch (error) {
    console.error("clearCart error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

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
export const getUserOrders = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim();
    const filter = email ? { user_email: email } : {};
    const orders = await Orders.find(filter)
      .populate({ path: "items.product", select: "name title price selling_price product_image colorVariants" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 })
      .lean();
    if (isShiprocketTestMode && Array.isArray(orders)) {
      const updates = [];
      for (const order of orders) {
        const nextStatus = getMockOrderStatus(order.createdAt, order.status);
        if (nextStatus !== order.status) {
          order.status = nextStatus;
          updates.push(Orders.updateOne({ _id: order._id }, { status: nextStatus }));
        }
      }
      if (updates.length) await Promise.all(updates);
    }
    return res.status(200).json({ status: true, orders });
  } catch (error) {
    console.error("getUserOrders error:", error);
    return res.status(500).json({ status: false, message: "Failed to load orders" });
  }
};

// Razorpay order creation
export const createOrder = async (req, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(500).json({ status: false, message: "Razorpay keys missing in env" });
    }

    const { items = [], address_id, email } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: false, message: "Items required" });
    }

    // fetch product prices
    const ids = items.map((i) => Number(i.product_id)).filter(Boolean);
    const products = await Products.find({ product_id: { $in: ids } }).lean();
    const productMap = new Map(products.map((p) => [p.product_id, p]));

    let amountPaise = 0;
    const orderItems = [];
    for (const it of items) {
      const prod = productMap.get(Number(it.product_id));
      const price = prod ? Number(prod.selling_price || prod.price || 0) : 0;
      const qty = Number(it.quantity) || 1;
      amountPaise += Math.max(price, 0) * qty * 100;
      orderItems.push({
        product_id: it.product_id,
        quantity: qty,
        price,
        product: prod?._id,
        color: it.color || "",
        size: it.size || "",
      });
    }
    if (!amountPaise) amountPaise = 100;

    const payload = {
      amount: Math.round(amountPaise),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: { address_id: address_id || "" },
    };

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    if (!rpRes.ok) {
      const text = await rpRes.text();
      throw new Error(`Razorpay order failed: ${rpRes.status} ${text}`);
    }
    const order = await rpRes.json();

    const addressDoc = address_id
      ? await Addresses.findOne({ address_id: Number(address_id) })
      : null;

    const localOrderId = await getNextSequence("order_id");
    await Orders.create({
      order_id: localOrderId,
      status: "pending",
      payment_status: "created",
      payment_method: "Razorpay",
      amount: payload.amount,
      currency: payload.currency,
      razorpay_order_id: order.id,
      items: orderItems,
      address: addressDoc?._id,
      user_email: email || "",
      FullName: addressDoc?.FullName || addressDoc?.full_name || "",
      phone1: addressDoc?.phone1 || addressDoc?.phone || "",
      phone2: addressDoc?.phone2 || addressDoc?.alt_phone || "",
      address_line1: addressDoc?.address_line1 || addressDoc?.address || "",
      city: addressDoc?.city || "",
      state: addressDoc?.state || "",
      country: addressDoc?.country || "",
      pinCode: addressDoc?.pinCode || addressDoc?.postal_code || "",
      addressType: addressDoc?.addressType || "",
    });

    return res.status(200).json({
      status: true,
      order,
      key: keyId,
      amount: payload.amount,
      currency: payload.currency,
      local_order_id: localOrderId,
    });
  } catch (error) {
    console.error("createOrder error:", error);
    return res.status(500).json({ status: false, message: "Failed to create order" });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ status: false, message: "Missing payment params" });
    }
    const crypto = await import("crypto");
    const generatedSignature = crypto.createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ status: false, message: "Signature mismatch" });
    }

    const order = await Orders.findOne({ razorpay_order_id });
    if (order) {
      order.payment_status = "paid";
      order.status = "confirmed";
      order.razorpay_payment_id = razorpay_payment_id;
      order.razorpay_signature = razorpay_signature;
      await order.save();

      try {
        const productIds = (order.items || [])
          .map((i) => Number(i.product_id))
          .filter(Boolean);
        const products = await Products.find({ product_id: { $in: productIds } })
          .select("product_id name title sku")
          .lean();
        const map = new Map(products.map((p) => [p.product_id, p]));
        const items = (order.items || []).map((it) => ({
          ...(it.toObject?.() || it),
          title: map.get(Number(it.product_id))?.title || map.get(Number(it.product_id))?.name || "",
          name: map.get(Number(it.product_id))?.name || "",
          sku: map.get(Number(it.product_id))?.sku || "",
        }));
        const ship = await createShiprocketShipment({ order, items });
        Object.assign(order, ship);
        await order.save();
      } catch (shipErr) {
        order.shiprocket_error = shipErr?.message || "Shiprocket failed";
        await order.save();
        console.error("Shiprocket error:", shipErr);
      }
    }

    return res.status(200).json({ status: true, message: "Payment verified", order_id: order?.order_id });
  } catch (error) {
    console.error("confirmPayment error:", error);
    return res.status(500).json({ status: false, message: "Failed to confirm payment" });
  }
};

export const updateUserAddress = async (req, res) => {
  try {
    const { address_id, id, ...rest } = req.body || {};
    const addrId = Number(address_id ?? id);
    if (!addrId || Number.isNaN(addrId)) {
      return res.status(400).json({ status: false, message: "address_id required" });
    }
    const updated = await Addresses.findOneAndUpdate(
      { address_id: addrId },
      {
        full_name: rest.FullName,
        email: req.user?.email || rest.email,
        phone: rest.phone1,
        alt_phone: rest.phone2,
        address_line1: rest.address,
        address_line2: rest.address_line2 || rest.district || "",
        city: rest.city,
        district: rest.district,
        state: rest.state,
        postal_code: rest.pinCode,
        country: rest.country,
        FullName: rest.FullName,
        phone1: rest.phone1,
        phone2: rest.phone2,
        email: req.user?.email || rest.email,
        pinCode: rest.pinCode,
        address: rest.address,
        address_line2: rest.address_line2 || rest.district || "",
        district: rest.district,
        addressType: rest.addressType,
      },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ status: false, message: "Address not found" });
    }
    const shaped = {
      id: updated.address_id,
      address_id: updated.address_id,
      FullName: updated.FullName,
      phone1: updated.phone1,
      phone2: updated.phone2,
      email: updated.email || "",
      country: updated.country,
      state: updated.state,
      city: updated.city,
      district: updated.district || updated.address_line2 || "",
      pinCode: updated.pinCode,
      address: updated.address,
      address_line2: updated.address_line2 || "",
      addressType: updated.addressType,
    };
    return res.status(200).json({ status: true, address: shaped, data: shaped });
  } catch (error) {
    console.error("updateUserAddress error:", error);
    return res.status(500).json({ status: false, message: "Failed to update address" });
  }
};

export const getUserAddresses = async (_req, res) => {
  const email = (_req.user?.email || _req.body?.email || "").trim();
  const filter = email ? { email } : {};
  const addresses = await Addresses.find(filter).sort({ createdAt: -1 });
  const mapped = addresses.map((a) => ({
    id: a.address_id || a._id?.toString(),
    address_id: a.address_id,
    FullName: a.FullName || a.full_name || "",
    phone1: a.phone1 || a.phone || "",
    phone2: a.phone2 || a.alt_phone || "",
    email: a.email || "",
    country: a.country || "",
    state: a.state || "",
    city: a.city || "",
    district: a.district || a.address_line2 || "",
    pinCode: a.pinCode || a.postal_code || "",
    address: a.address || a.address_line1 || "",
    address_line2: a.address_line2 || "",
    addressType: a.addressType || "",
  }));
  return res
    .status(200)
    .json({ status: true, addresses: mapped, data: mapped, message: "ok" });
};

export const createNewAddress = async (req, res) => {
  try {
    const payload = req.body || {};
    if (req.user?.email) payload.email = req.user.email;
    if (!payload.address_id) {
      payload.address_id = await getNextSequence("address_id");
    }
    const addr = await Addresses.create({
      address_id: payload.address_id,
      full_name: payload.FullName,
      email: payload.email,
      phone: payload.phone1,
      alt_phone: payload.phone2,
      address_line1: payload.address || "",
      address_line2: payload.address_line2 || payload.district || "",
      city: payload.city,
      district: payload.district,
      state: payload.state,
      postal_code: payload.pinCode,
      country: payload.country || "India",
      FullName: payload.FullName,
      phone1: payload.phone1,
      phone2: payload.phone2,
      pinCode: payload.pinCode,
      address: payload.address,
      address_line2: payload.address_line2 || payload.district || "",
      district: payload.district,
      addressType: payload.addressType,
    });
    const shaped = {
      id: addr.address_id,
      address_id: addr.address_id,
      FullName: addr.FullName,
      phone1: addr.phone1,
      phone2: addr.phone2,
      email: addr.email || "",
      country: addr.country,
      state: addr.state,
      city: addr.city,
      district: addr.district || addr.address_line2 || "",
      pinCode: addr.pinCode,
      address: addr.address,
      address_line2: addr.address_line2 || "",
      addressType: addr.addressType,
    };
    return res
      .status(201)
      .json({ status: true, address: shaped, data: shaped, message: "Address created" });
  } catch (error) {
    console.error("createNewAddress error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to create address" });
  }
};

// ---- Orders: cancel order ----
export const cancelOrder = async (req, res) => {
  try {
    const { order_id, id } = req.body || {};
    const idStr = order_id || id;
    if (!idStr) {
      return res.status(400).json({ status: false, message: "order_id required" });
    }

    // Match either numeric order_id or Mongo _id
    const query =
      !Number.isNaN(Number(idStr)) && Number.isFinite(Number(idStr))
        ? { order_id: Number(idStr) }
        : { _id: idStr };

    const order = await Orders.findOne(query);
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    const finalStatuses = ["cancelled", "rejected", "delivered", "rto"];
    if (finalStatuses.includes((order.status || "").toLowerCase())) {
      return res
        .status(400)
        .json({ status: false, message: `Order already ${order.status}` });
    }

    order.status = "cancelled";
    order.payment_status = order.payment_status === "paid" ? "refund_pending" : "cancelled";
    await order.save();

    return res.status(200).json({
      status: true,
      message: "Order cancelled",
      order,
    });
  } catch (error) {
    console.error("cancelOrder error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to cancel order" });
  }
};

export const requestReturn = async (req, res) => {
  try {
    const { order_id, id } = req.body || {};
    const idStr = order_id || id;
    if (!idStr) {
      return res.status(400).json({ status: false, message: "order_id required" });
    }
    const email = req.user?.email || "";
    const query =
      !Number.isNaN(Number(idStr)) && Number.isFinite(Number(idStr))
        ? { order_id: Number(idStr) }
        : { _id: idStr };
    if (email) query.user_email = email;

    const order = await Orders.findOne(query);
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    const status = String(order.status || "").toLowerCase();
    if (!status.includes("deliver")) {
      return res.status(400).json({ status: false, message: "Order not delivered yet" });
    }
    if (status.includes("return")) {
      return res.status(400).json({ status: false, message: "Return already requested" });
    }

    order.status = "return_requested";
    await order.save();
    return res.status(200).json({ status: true, message: "Return requested", order });
  } catch (error) {
    console.error("requestReturn error:", error);
    return res.status(500).json({ status: false, message: "Failed to request return" });
  }
};

export const lookupPincode = async (req, res) => {
  try {
    const pin = String(req.params.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ status: false, message: "Valid 6-digit pincode required" });
    }

    const resp = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    if (!resp.ok) {
      return res.status(502).json({ status: false, message: "Pincode service unavailable" });
    }
    const data = await resp.json();
    const entry = Array.isArray(data) ? data[0] : null;
    const offices = entry?.PostOffice || [];
    if (!offices.length) {
      return res.status(404).json({ status: false, message: "Pincode not found" });
    }
    const pick = offices[0];
    return res.status(200).json({
      status: true,
      pin,
      district: pick?.District || "",
      state: pick?.State || "",
      country: pick?.Country || "India",
    });
  } catch (error) {
    console.error("lookupPincode error:", error);
    return res.status(500).json({ status: false, message: "Pincode lookup failed" });
  }
};

export const estimateDelivery = async (req, res) => {
  try {
    const pin = String(req.query.pin || req.body?.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ status: false, message: "Valid 6-digit pincode required" });
    }
    const weight = Number(req.query.weight || req.body?.weight || 0.5);
    const total = Number(req.query.total || req.body?.total || 0);
    const estimate = await getDeliveryEstimate({ deliveryPincode: pin, weight, total });
    if (!estimate?.courier) {
      return res.status(404).json({ status: false, message: "No courier available" });
    }
    const etdDays = Number(estimate.courier.etd || 0);
    const eta = new Date();
    eta.setDate(eta.getDate() + (Number.isFinite(etdDays) ? etdDays : 0));
    const dd = eta.getDate();
    const mm = eta.getMonth() + 1;
    const yyyy = eta.getFullYear();
    return res.status(200).json({
      status: true,
      pin,
      courier: estimate.courier,
      etd_days: etdDays,
      eta: `${dd}-${mm}-${yyyy}`,
      test_mode: isShiprocketTestMode,
    });
  } catch (error) {
    console.error("estimateDelivery error:", error);
    return res.status(500).json({ status: false, message: "Failed to estimate delivery" });
  }
};
