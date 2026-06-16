import Cart from "../../model/cart.model.js";
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
