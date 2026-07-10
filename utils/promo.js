const normalizeCode = (code) => String(code || "").trim().toUpperCase();

const getQty = (item) => Math.max(1, Number(item?.quantity || item?.qty || 1) || 1);

const getPrice = (item) => Math.max(0, Number(item?.price || 0) || 0);

const getProductId = (item) => Number(item?.product_id || item?.id || 0);

const isPromoActive = (promo, now = new Date()) => {
  if (!promo) return { ok: false, message: "Promo code not found" };
  if (promo.status !== "ACTIVE") return { ok: false, message: "Promo code is inactive" };
  if (promo.startsAt && new Date(promo.startsAt) > now) {
    return { ok: false, message: "Promo is not active yet" };
  }
  if (promo.endsAt && new Date(promo.endsAt) < now) {
    return { ok: false, message: "Promo has expired" };
  }
  if (promo.usageLimit > 0 && promo.usedCount >= promo.usageLimit) {
    return { ok: false, message: "Promo usage limit reached" };
  }
  return { ok: true, message: "" };
};

const isPromoTimerActive = (promo, now = new Date()) => {
  if (promo.timer?.enabled) {
    const start = promo.timer.startAt ? new Date(promo.timer.startAt) : null;
    const end = promo.timer.endAt ? new Date(promo.timer.endAt) : null;
    if (start && start > now) return { ok: false, message: "Promo timer has not started yet" };
    if (promo.timer.type === "FIXED_WINDOW" && end && end < now) {
      return { ok: false, message: "Promo timer has ended" };
    }
    if (promo.timer.type === "ONE_TIME" && start && promo.timer.durationMinutes > 0) {
      const oneTimeEnd = new Date(start.getTime() + promo.timer.durationMinutes * 60 * 1000);
      if (oneTimeEnd < now) return { ok: false, message: "Promo timer has ended" };
    }
  }
  return { ok: true, message: "" };
};

export const computePromoSubtotal = (items = []) =>
  items.reduce((sum, item) => sum + getPrice(item) * getQty(item), 0);

const computePromoQuantity = (items = []) =>
  items.reduce((sum, item) => sum + getQty(item), 0);

export const serializePromo = (promo) => ({
  id: String(promo._id || ""),
  code: normalizeCode(promo.code),
  description: promo.description || "",
  discountType: promo.discountType,
  discountValue: Number(promo.discountValue || 0),
  minimumOrderAmount: Number(promo.minimumOrderAmount || 0),
  minimumQuantity: Number(promo.minimumQuantity || 1),
  maxDiscountAmount: Number(promo.maxDiscountAmount || 0),
  target: promo.target || { scope: "ALL_PRODUCTS", productIds: [], categoryIds: [] },
  startsAt: promo.startsAt || null,
  endsAt: promo.endsAt || null,
  timer: promo.timer || null,
});

export const promoMatchesItems = ({ promo, items = [], products = [] }) => {
  const scope = promo?.target?.scope || "ALL_PRODUCTS";
  if (scope === "ALL_PRODUCTS") return true;

  const itemIds = new Set(items.map(getProductId).filter(Boolean));
  if (scope === "SELECTED_PRODUCTS") {
    return (promo.target?.productIds || []).some((id) => itemIds.has(Number(id)));
  }

  if (scope === "SELECTED_CATEGORIES") {
    const categoryIds = new Set(
      products
        .filter((product) => itemIds.has(Number(product.product_id)))
        .map((product) => String(product.catagory_id?._id || product.catagory_id || ""))
        .filter(Boolean)
    );
    return (promo.target?.categoryIds || []).some((id) => categoryIds.has(String(id)));
  }

  return false;
};

export const evaluatePromo = ({ promo, items = [], products = [], subtotal, now = new Date() }) => {
  const active = isPromoActive(promo, now);
  if (!active.ok) {
    return { ok: false, message: active.message, discountAmount: 0, subtotal: subtotal || 0, totalAfterDiscount: subtotal || 0 };
  }

  const cartSubtotal = Number.isFinite(Number(subtotal)) ? Number(subtotal) : computePromoSubtotal(items);
  const cartQuantity = computePromoQuantity(items);
  const minimumQuantity = Math.max(1, Number(promo.minimumQuantity || 1));

  if (cartQuantity < minimumQuantity) {
    return {
      ok: false,
      message: `Minimum item quantity is ${minimumQuantity}`,
      discountAmount: 0,
      subtotal: cartSubtotal,
      totalAfterDiscount: cartSubtotal,
    };
  }

  if (cartSubtotal < Number(promo.minimumOrderAmount || 0)) {
    return {
      ok: false,
      message: `Minimum order value is Rs ${Number(promo.minimumOrderAmount || 0)}`,
      discountAmount: 0,
      subtotal: cartSubtotal,
      totalAfterDiscount: cartSubtotal,
    };
  }

  if (!promoMatchesItems({ promo, items, products })) {
    return {
      ok: false,
      message: "Promo is not applicable for selected products",
      discountAmount: 0,
      subtotal: cartSubtotal,
      totalAfterDiscount: cartSubtotal,
    };
  }

  const timer = isPromoTimerActive(promo, now);
  if (!timer.ok) {
    return { ok: false, message: timer.message, discountAmount: 0, subtotal: cartSubtotal, totalAfterDiscount: cartSubtotal };
  }

  const rawDiscount =
    promo.discountType === "PERCENTAGE"
      ? (cartSubtotal * Number(promo.discountValue || 0)) / 100
      : Number(promo.discountValue || 0);
  const maxDiscount = Number(promo.maxDiscountAmount || 0);
  const cappedDiscount = maxDiscount > 0 ? Math.min(rawDiscount, maxDiscount) : rawDiscount;
  const discountAmount = Math.max(0, Math.min(cartSubtotal, Math.round(cappedDiscount)));

  return {
    ok: discountAmount > 0,
    message: discountAmount > 0 ? "Promo applied successfully" : "Promo does not reduce this cart",
    promo: serializePromo(promo),
    subtotal: cartSubtotal,
    discountAmount,
    totalAfterDiscount: Math.max(cartSubtotal - discountAmount, 0),
  };
};

export { normalizeCode };
