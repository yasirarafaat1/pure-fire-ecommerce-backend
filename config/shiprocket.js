import "./env.js";

const BASE_URL = (process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in").replace(
  /\/+$/,
  "",
);
const EMAIL = process.env.SHIPROCKET_EMAIL || "";
const PASSWORD = process.env.SHIPROCKET_PASSWORD || "";
const TEST_MODE =
  String(process.env.SHIPROCKET_TEST_MODE || "").toLowerCase() === "1" ||
  String(process.env.SHIPROCKET_TEST_MODE || "").toLowerCase() === "true";
const PICKUP_PINCODE = process.env.SHIPROCKET_PICKUP_PINCODE || "";
const PICKUP_LOCATION = process.env.SHIPROCKET_PICKUP_LOCATION || "Primary";
const DEFAULT_WEIGHT = Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 0.5);
const DEFAULT_LENGTH = Number(process.env.SHIPROCKET_DEFAULT_LENGTH_CM || 10);
const DEFAULT_BREADTH = Number(process.env.SHIPROCKET_DEFAULT_BREADTH_CM || 10);
const DEFAULT_HEIGHT = Number(process.env.SHIPROCKET_DEFAULT_HEIGHT_CM || 10);

const tokenCache = {
  token: "",
  expiresAt: 0,
};

const getToken = async () => {
  if (TEST_MODE) return "shiprocket-test-token";
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 60 * 1000) {
    return tokenCache.token;
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error("Shiprocket credentials missing");
  }
  const res = await fetch(`${BASE_URL}/v1/external/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok || !data?.token) {
    throw new Error(data?.message || "Shiprocket auth failed");
  }
  tokenCache.token = data.token;
  tokenCache.expiresAt = now + 9 * 24 * 60 * 60 * 1000;
  return tokenCache.token;
};

const shiprocketRequest = async (path, options = {}) => {
  if (TEST_MODE) {
    return { status: "ok", path, options };
  }
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.message || `Shiprocket error ${res.status}`);
  }
  return data;
};

const normalizeCouriers = (payload) => {
  const list =
    payload?.data?.available_courier_companies ||
    payload?.available_courier_companies ||
    payload?.courier_companies ||
    [];
  return list.map((c) => ({
    id: Number(c.courier_company_id || c.id || c.courier_id || 0) || null,
    name: c.courier_name || c.name || c.courier || "",
    rate: Number(
      c.rate || c.freight_charge || c.charge || c.cost || c.price || c.total_charge || 0,
    ),
    etd: Number(c.estimated_delivery_days || c.etd || c.etd_hours || 0),
  }));
};

const pickBestCourier = (couriers) => {
  const valid = couriers.filter((c) => c.id);
  if (!valid.length) return null;
  return valid.sort((a, b) => {
    const scoreA = (a.rate || 0) + (a.etd || 0) * 6;
    const scoreB = (b.rate || 0) + (b.etd || 0) * 6;
    return scoreA - scoreB;
  })[0];
};

const buildMockCouriers = ({ deliveryPincode, weight, total }) => {
  const pinSeed = Number(String(deliveryPincode || "").slice(-2)) || 10;
  const base = Math.max(40, Math.round(30 + (weight || DEFAULT_WEIGHT) * 15 + total / 500 + pinSeed / 3));
  const drift = pinSeed % 5;
  return [
    { id: 201, name: "Xpressbees", rate: base + 5 + (pinSeed % 7), etd: 3 + (drift % 3) },
    { id: 202, name: "Delhivery", rate: base + 9 + (pinSeed % 5), etd: 2 + (pinSeed % 4) },
    { id: 203, name: "Ecom Express", rate: base + 7 + (pinSeed % 6), etd: 1 + (pinSeed % 5) },
    { id: 204, name: "Shadowfax", rate: base + 11 + (pinSeed % 4), etd: 1 + (pinSeed % 3) },
  ];
};

export const isShiprocketTestMode = TEST_MODE;

export const getMockOrderStatus = (createdAt, currentStatus = "pending") => {
  if (!TEST_MODE) return currentStatus;
  const finalStatuses = ["cancelled", "delivered", "rto", "rejected", "return_requested", "returned"];
  const normalized = String(currentStatus || "").toLowerCase();
  if (finalStatuses.includes(normalized)) return currentStatus;
  const created = createdAt ? new Date(createdAt).getTime() : Date.now();
  const minutes = (Date.now() - created) / 60000;
  if (minutes < 2) return "confirmed";
  if (minutes < 5) return "shipped";
  if (minutes < 10) return "out for delivery";
  return "delivered";
};

const getServiceability = async ({ deliveryPincode, weight, orderId }) => {
  if (!PICKUP_PINCODE || !deliveryPincode) return null;
  const params = new URLSearchParams({
    pickup_postcode: PICKUP_PINCODE,
    delivery_postcode: deliveryPincode,
    weight: String(weight || DEFAULT_WEIGHT),
    cod: "0",
  });
  if (orderId) params.append("order_id", String(orderId));
  return shiprocketRequest(`/v1/external/courier/serviceability?${params.toString()}`);
};

export const getDeliveryEstimate = async ({ deliveryPincode, weight, orderId, total }) => {
  if (!deliveryPincode) return null;
  if (TEST_MODE) {
    const couriers = buildMockCouriers({
      deliveryPincode,
      weight: weight || DEFAULT_WEIGHT,
      total: total || 0,
    });
    const best = pickBestCourier(couriers);
    return { courier: best, couriers };
  }
  const serviceability = await getServiceability({
    deliveryPincode,
    weight: weight || DEFAULT_WEIGHT,
    orderId,
  });
  const couriers = normalizeCouriers(serviceability);
  const best = pickBestCourier(couriers);
  return { courier: best, couriers };
};

const createOrder = async ({ orderId, items, address, total }) => {
  if (TEST_MODE) {
    return { order_id: Number(orderId) || 0, shipment_id: Number(orderId) || 0 };
  }
  const payload = {
    order_id: String(orderId),
    order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
    pickup_location: PICKUP_LOCATION,
    billing_customer_name: address?.name || "Customer",
    billing_last_name: "",
    billing_address: address?.address_line1 || "",
    billing_city: address?.city || "",
    billing_pincode: address?.pinCode || "",
    billing_state: address?.state || "",
    billing_country: address?.country || "India",
    billing_email: address?.email || "",
    billing_phone: address?.phone1 || address?.phone || "",
    shipping_is_billing: true,
    order_items: items.map((it) => ({
      name: it.title || it.name || "Item",
      sku: it.sku || String(it.product_id || ""),
      units: Number(it.quantity) || 1,
      selling_price: Number(it.price || 0),
    })),
    payment_method: "Prepaid",
    sub_total: Number(total || 0),
    length: DEFAULT_LENGTH,
    breadth: DEFAULT_BREADTH,
    height: DEFAULT_HEIGHT,
    weight: DEFAULT_WEIGHT,
  };
  return shiprocketRequest("/v1/external/orders/create/adhoc", { method: "POST", body: payload });
};

const assignAwb = async ({ shipmentId, courierId }) => {
  if (!shipmentId || !courierId) return null;
  if (TEST_MODE) {
    return { awb_code: `SRTEST${shipmentId}` };
  }
  return shiprocketRequest("/v1/external/courier/assign/awb", {
    method: "POST",
    body: { shipment_id: shipmentId, courier_id: courierId },
  });
};

export const createShiprocketShipment = async ({ order, items }) => {
  const deliveryPincode = order?.pinCode || order?.pin_code || "";
  const total = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0),
    0,
  );
  if (TEST_MODE) {
    const mockId = Number(order?.order_id || 0) || Date.now();
    const couriers = buildMockCouriers({
      deliveryPincode,
      weight: DEFAULT_WEIGHT,
      total,
    });
    const best = pickBestCourier(couriers);
    return {
      shiprocket_order_id: mockId,
      shiprocket_shipment_id: mockId,
      shiprocket_awb: `SRTEST${mockId}`,
      courier_company_id: best?.id || 999,
      courier_name: best?.name || "Shiprocket Test Courier",
      courier_rate: Number.isFinite(best?.rate) ? best.rate : null,
      courier_etd: Number.isFinite(best?.etd) ? best.etd : null,
    };
  }
  if (!deliveryPincode) {
    throw new Error("Delivery pincode missing for Shiprocket");
  }

  const address = {
    name: order?.FullName || "",
    phone1: order?.phone1 || "",
    address_line1: order?.address_line1 || "",
    city: order?.city || "",
    state: order?.state || "",
    country: order?.country || "India",
    pinCode: deliveryPincode,
    email: order?.user_email || "",
  };

  const created = await createOrder({
    orderId: order?.order_id || order?._id,
    items,
    address,
    total,
  });

  const shiprocketOrderId = created?.order_id || created?.data?.order_id;
  const shipmentId = created?.shipment_id || created?.data?.shipment_id;

  const serviceability = await getServiceability({
    deliveryPincode,
    weight: DEFAULT_WEIGHT,
    orderId: shiprocketOrderId,
  });
  const couriers = normalizeCouriers(serviceability);
  const best = pickBestCourier(couriers);
  const assign = best ? await assignAwb({ shipmentId, courierId: best.id }) : null;

  return {
    shiprocket_order_id: shiprocketOrderId,
    shiprocket_shipment_id: shipmentId,
    shiprocket_awb: assign?.awb_code || assign?.data?.awb_code || "",
    courier_company_id: best?.id || null,
    courier_name: best?.name || "",
    courier_rate: Number.isFinite(best?.rate) ? best.rate : null,
    courier_etd: Number.isFinite(best?.etd) ? best.etd : null,
  };
};
