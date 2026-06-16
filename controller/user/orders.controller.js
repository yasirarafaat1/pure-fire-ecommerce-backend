import Orders from "../../model/orders.model.js";
import PendingOrders from "../../model/pendingOrder.model.js";
import Products from "../../model/product.model.js";
import Addresses from "../../model/addresses.model.js";
import { getNextSequence } from "../../model/counter.model.js";
import { createShiprocketShipment, getMockOrderStatus, isShiprocketTestMode } from "../../config/shiprocket.js";
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

    await PendingOrders.create({
      razorpay_order_id: order.id,
      items: orderItems,
      address_id: address_id ? Number(address_id) : null,
      email: email || "",
      amount: payload.amount,
      currency: payload.currency,
    });

    return res.status(200).json({
      status: true,
      order,
      key: keyId,
      amount: payload.amount,
      currency: payload.currency,
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

    let order = await Orders.findOne({ razorpay_order_id });
    if (!order) {
      const pending = await PendingOrders.findOne({ razorpay_order_id }).lean();
      if (!pending) {
        return res.status(404).json({ status: false, message: "Pending order not found" });
      }
      const addressDoc = pending.address_id
        ? await Addresses.findOne({ address_id: Number(pending.address_id) })
        : null;
      const localOrderId = await getNextSequence("order_id");
      order = await Orders.create({
        order_id: localOrderId,
        status: "confirmed",
        payment_status: "paid",
        payment_method: "Razorpay",
        amount: pending.amount,
        currency: pending.currency,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        items: pending.items || [],
        address: addressDoc?._id,
        user_email: pending.email || "",
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
      await PendingOrders.deleteOne({ _id: pending._id });
    } else {
      order.payment_status = "paid";
      order.status = "confirmed";
      order.razorpay_payment_id = razorpay_payment_id;
      order.razorpay_signature = razorpay_signature;
      await order.save();
    }

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

    return res.status(200).json({ status: true, message: "Payment verified", order_id: order?.order_id });
  } catch (error) {
    console.error("confirmPayment error:", error);
    return res.status(500).json({ status: false, message: "Failed to confirm payment" });
  }
};
