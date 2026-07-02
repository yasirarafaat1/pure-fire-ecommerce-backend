import Orders from "../../model/orders.model.js";
import Products from "../../model/product.model.js";
import { getDeliveryEstimate, isShiprocketTestMode } from "../../config/shiprocket.js";

const buildFallbackDeliveryEstimate = (pin, days = 4) => {
  const eta = new Date();
  eta.setDate(eta.getDate() + days);
  const dd = eta.getDate();
  const mm = eta.getMonth() + 1;
  const yyyy = eta.getFullYear();
  return {
    status: true,
    pin,
    courier: {
      id: null,
      name: "Standard Delivery",
      rate: 0,
      etd: days,
    },
    etd_days: days,
    eta: `${dd}-${mm}-${yyyy}`,
    fallback: true,
    test_mode: isShiprocketTestMode,
  };
};
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
      return res.status(200).json(buildFallbackDeliveryEstimate(pin));
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
    const pin = String(req.query.pin || req.body?.pin || "").trim();
    if (/^\d{6}$/.test(pin)) {
      return res.status(200).json(buildFallbackDeliveryEstimate(pin));
    }
    return res.status(500).json({ status: false, message: "Failed to estimate delivery" });
  }
};
