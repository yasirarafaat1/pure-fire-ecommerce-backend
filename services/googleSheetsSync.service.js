import StoreSetting from "../model/storeSetting.model.js";
import Products from "../model/product.model.js";
import Orders from "../model/orders.model.js";
import Invoice from "../model/invoice.model.js";

const PRODUCT_HEADERS = [
  "Product ID",
  "Name",
  "Title",
  "SKU",
  "Status",
  "Category",
  "Price",
  "Selling Price",
  "Quantity",
  "Colors",
  "Sizes",
  "Images",
  "Video URL",
  "Created At",
  "Updated At",
];

const ORDER_HEADERS = [
  "Order ID",
  "Invoice ID",
  "Invoice Number",
  "Invoice Date",
  "Status",
  "Payment Status",
  "Payment Method",
  "Amount",
  "Currency",
  "Customer Name",
  "Email",
  "Phone",
  "Address",
  "City",
  "State",
  "Pincode",
  "Items",
  "Razorpay Order ID",
  "Razorpay Payment ID",
  "Tracking Number",
  "Tracking URL",
  "Courier",
  "Created At",
  "Updated At",
];

const toIso = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const join = (value) => (Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value || ""));

const timeoutFetch = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const getGoogleSheetsSettings = async () => {
  const settings = await StoreSetting.findOne({ key: "default" }).lean();
  const googleSheets = settings?.googleSheets || {};
  return {
    enabled: Boolean(googleSheets.enabled),
    appScriptUrl: String(googleSheets.appScriptUrl || "").trim(),
    secret: String(googleSheets.secret || "").trim(),
    spreadsheetId: String(googleSheets.spreadsheetId || "").trim(),
    productsTabName: String(googleSheets.productsTabName || "Products").trim() || "Products",
    ordersTabName: String(googleSheets.ordersTabName || "Orders").trim() || "Orders",
  };
};

const requireConfiguredSettings = async () => {
  const settings = await getGoogleSheetsSettings();
  if (!settings.enabled) {
    const error = new Error("Google Sheets sync is disabled");
    error.statusCode = 400;
    throw error;
  }
  if (!settings.appScriptUrl) {
    const error = new Error("Google Apps Script URL is required");
    error.statusCode = 400;
    throw error;
  }
  if (!settings.secret) {
    const error = new Error("Google Sheets sync secret is required");
    error.statusCode = 400;
    throw error;
  }
  return settings;
};

const productRow = (product) => ({
  "Product ID": product.product_id || "",
  Name: product.name || "",
  Title: product.title || "",
  SKU: product.sku || "",
  Status: product.status || "",
  Category: product.catagory_id?.name || product.catagory_id || "",
  Price: product.price ?? "",
  "Selling Price": product.selling_price ?? "",
  Quantity: product.quantity ?? "",
  Colors: join(product.colors),
  Sizes: join(product.sizes),
  Images: join(product.product_image),
  "Video URL": product.video_url || "",
  "Created At": toIso(product.createdAt),
  "Updated At": toIso(product.updatedAt),
});

const orderItemsText = (order) =>
  (order.items || [])
    .map((item) => {
      const product = item.product || {};
      const name = product.title || product.name || item.title || item.name || `Product #${item.product_id || ""}`;
      return `${name} x ${item.quantity || 1} @ ${item.price || ""}`.trim();
    })
    .join(" | ");

const orderAddress = (order) =>
  [order.address_line1, order.city, order.state, order.pinCode, order.country]
    .filter(Boolean)
    .join(", ");

const orderRow = (order, invoice) => ({
  "Order ID": order.order_id || "",
  "Invoice ID": invoice?._id ? String(invoice._id) : "",
  "Invoice Number": invoice?.invoiceNumber || "",
  "Invoice Date": toIso(invoice?.issuedAt),
  Status: order.status || "",
  "Payment Status": order.payment_status || "",
  "Payment Method": order.payment_method || "",
  Amount: order.amount ?? "",
  Currency: order.currency || "INR",
  "Customer Name": order.FullName || "",
  Email: order.user_email || "",
  Phone: order.phone1 || order.phone2 || "",
  Address: orderAddress(order),
  City: order.city || "",
  State: order.state || "",
  Pincode: order.pinCode || "",
  Items: orderItemsText(order),
  "Razorpay Order ID": order.razorpay_order_id || "",
  "Razorpay Payment ID": order.razorpay_payment_id || "",
  "Tracking Number": order.tracking_number || order.shiprocket_awb || "",
  "Tracking URL": order.tracking_url || "",
  Courier: order.courier_name || "",
  "Created At": toIso(order.createdAt),
  "Updated At": toIso(order.updatedAt),
});

const postToAppsScript = async (settings, payload) => {
  const response = await timeoutFetch(settings.appScriptUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: settings.secret,
      spreadsheetId: settings.spreadsheetId,
      ...payload,
    }),
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text();

  if (!response.ok) {
    const message = typeof body === "object" && body?.message ? body.message : `Apps Script failed: ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return body;
};

const updateSyncStatus = async ({ ok, message = "", products = 0, orders = 0, connected = false }) => {
  await StoreSetting.findOneAndUpdate(
    { key: "default" },
    {
      $set: {
        "googleSheets.lastSyncedAt": new Date(),
        "googleSheets.lastSyncStatus": ok ? "success" : "failed",
        "googleSheets.lastSyncError": ok ? "" : String(message || "Google Sheets sync failed").slice(0, 500),
        "googleSheets.lastSyncStats.products": products,
        "googleSheets.lastSyncStats.orders": orders,
        ...(connected ? { "googleSheets.lastConnectedAt": new Date() } : {}),
      },
      $setOnInsert: { key: "default" },
    },
    { upsert: true }
  );
};

export const testGoogleSheetsConnection = async () => {
  const settings = await requireConfiguredSettings();
  const result = await postToAppsScript(settings, {
    action: "test",
    tabs: [
      {
        name: settings.productsTabName,
        keyColumn: "Product ID",
        headers: PRODUCT_HEADERS,
        rows: [],
      },
      {
        name: settings.ordersTabName,
        keyColumn: "Order ID",
        headers: ORDER_HEADERS,
        rows: [],
      },
    ],
  });
  await updateSyncStatus({ ok: true, connected: true });
  return result;
};

export const syncAllToGoogleSheets = async () => {
  const settings = await requireConfiguredSettings();
  try {
    const [products, orders] = await Promise.all([
      Products.find({})
        .populate("catagory_id", "name")
        .sort({ product_id: 1 })
        .lean(),
      Orders.find({})
        .populate("items.product", "name title sku")
        .sort({ order_id: 1 })
        .lean(),
    ]);
    const invoices = await Invoice.find({
      orderId: { $in: orders.map((order) => order._id) },
    }).lean();
    const invoiceMap = new Map(invoices.map((invoice) => [String(invoice.orderId), invoice]));
    const result = await postToAppsScript(settings, {
      action: "manual_sync",
      mode: "upsert",
      tabs: [
        {
          name: settings.productsTabName,
          keyColumn: "Product ID",
          headers: PRODUCT_HEADERS,
          rows: products.map(productRow),
        },
        {
          name: settings.ordersTabName,
          keyColumn: "Order ID",
          headers: ORDER_HEADERS,
          rows: orders.map((order) => orderRow(order, invoiceMap.get(String(order._id)))),
        },
      ],
    });
    await updateSyncStatus({ ok: true, products: products.length, orders: orders.length, connected: true });
    return { result, products: products.length, orders: orders.length };
  } catch (error) {
    await updateSyncStatus({ ok: false, message: error.message });
    throw error;
  }
};

export const syncProductToGoogleSheets = async (productOrId) => {
  const settings = await getGoogleSheetsSettings();
  if (!settings.enabled || !settings.appScriptUrl || !settings.secret) return { skipped: true };

  const product = typeof productOrId === "object" && productOrId?._id
    ? productOrId
    : await Products.findOne({ product_id: Number(productOrId) || -1 })
        .populate("catagory_id", "name")
        .lean();
  if (!product) return { skipped: true };

  return postToAppsScript(settings, {
    action: "product_upsert",
    mode: "upsert",
    tabs: [
      {
        name: settings.productsTabName,
        keyColumn: "Product ID",
        headers: PRODUCT_HEADERS,
        rows: [productRow(product)],
      },
    ],
  });
};

export const syncOrderToGoogleSheets = async (orderOrId) => {
  const settings = await getGoogleSheetsSettings();
  if (!settings.enabled || !settings.appScriptUrl || !settings.secret) return { skipped: true };

  const filter =
    typeof orderOrId === "object" && orderOrId?._id
      ? { _id: orderOrId._id }
      : { order_id: Number(orderOrId) || -1 };
  const order = await Orders.findOne(filter)
    .populate("items.product", "name title sku")
    .lean();
  if (!order) return { skipped: true };

  const invoice = await Invoice.findOne({ orderId: order._id }).lean();
  return postToAppsScript(settings, {
    action: "order_upsert",
    mode: "upsert",
    tabs: [
      {
        name: settings.ordersTabName,
        keyColumn: "Order ID",
        headers: ORDER_HEADERS,
        rows: [orderRow(order, invoice)],
      },
    ],
  });
};

export const fireAndForgetSheetSync = (promise, label) => {
  Promise.resolve(promise).catch((error) => {
    console.warn(`Google Sheets ${label} sync failed:`, error.message);
  });
};
