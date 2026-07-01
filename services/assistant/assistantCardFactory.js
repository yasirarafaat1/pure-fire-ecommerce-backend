const money = (value) => Number(value || 0);

const slugify = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const maskEmail = (email = "") => {
  const [name, domain] = String(email).split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}***@${domain}`;
};

export const maskPhone = (phone = "") => {
  const raw = String(phone || "").replace(/\D/g, "");
  if (raw.length < 4) return "";
  return `${"*".repeat(Math.max(raw.length - 4, 3))}${raw.slice(-4)}`;
};

export const maskAddress = (address = "") => {
  const text = String(address || "").trim();
  if (!text) return "";
  if (text.length <= 18) return `${text.slice(0, 4)}***`;
  return `${text.slice(0, 16)}...`;
};

export const productCard = (product, badges = []) => {
  const productId = product?.product_id || product?._id;
  const title = product?.name || product?.title || "Product";
  const slug = slugify(product?.slug || title) || "product";
  const href = `/product/${encodeURIComponent(String(productId))}/${slug}`;
  const image = product?.product_image?.[0] || product?.images?.[0] || "";
  const price = money(product?.selling_price ?? product?.discountedPrice ?? product?.price);
  const mrp = money(product?.price ?? product?.mrp ?? price);
  const stock = Math.max(0, Number(product?.quantity || 0));
  const category =
    typeof product?.catagory_id === "object" ? product?.catagory_id?.name || "" : "";

  return {
    type: "product",
    productId,
    title,
    image,
    price,
    mrp,
    stock,
    category,
    href,
    badges,
    actions: [
      { label: "Buy Now", type: "action", action: "buy_now", payload: { productId } },
      { label: "Add to Cart", type: "action", action: "add_to_cart", payload: { productId } },
    ],
  };
};

export const orderCard = (order, { limited = false } = {}) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  return {
    type: "order",
    orderId: order?.order_id || order?._id || "",
    invoiceNumber: order?.invoiceNumber || "",
    status: order?.status || "pending",
    paymentStatus: order?.payment_status || "",
    total: money(order?.amount),
    placedAt: order?.createdAt || "",
    trackingUrl: order?.tracking_url || "",
    eta: order?.courier_etd ? `${order.courier_etd} days` : "",
    itemsPreview: items.slice(0, limited ? 2 : 4).map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
      price: limited ? undefined : item.price,
    })),
    itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
    isLimited: limited,
    actions: limited
      ? []
      : [{ label: "View Order", type: "link", href: `/orders/${order?.order_id}` }],
  };
};

export const profileCard = ({ profile, email, phone }) => ({
  type: "profile",
  name: profile?.name || "Customer",
  emailMasked: maskEmail(email || profile?.email || ""),
  phoneMasked: maskPhone(phone || ""),
  actions: [{ label: "Open Profile", type: "link", href: "/profile" }],
});

export const wishlistCard = (products = []) => ({
  type: "wishlist",
  count: products.length,
  products: products.slice(0, 6).map((product) => productCard(product, ["Wishlist"])),
});

export const addressCard = (address, index = 0) => ({
  type: "address",
  title: address?.addressType || `Address ${index + 1}`,
  maskedAddress: maskAddress(address?.address || address?.address_line1 || ""),
  city: address?.city || "",
  state: address?.state || "",
  pincode: address?.pinCode || address?.postal_code || "",
  isDefault: index === 0,
});

export const loginPromptCard = (message = "Please login to view this information.") => ({
  type: "login_prompt",
  title: "Login required",
  message,
  action: { label: "Login", href: "/login" },
});

export const loginOtpCard = (language = "en") => {
  if (language === "hi") {
    return {
      type: "login_otp",
      title: "लॉगिन करें",
      message: "अपना ईमेल डालें। हम OTP भेजेंगे, फिर OTP verify करके login हो जाएगा।",
      emailPlaceholder: "you@email.com",
      otpPlaceholder: "OTP डालें",
      sendLabel: "OTP भेजें",
      verifyLabel: "Verify करके login करें",
      changeEmailLabel: "Email बदलें",
    };
  }
  const hinglish = language === "hinglish";
  return {
    type: "login_otp",
    title: hinglish ? "Login karo" : "Login with OTP",
    message: hinglish
      ? "Apna email daalo. Main OTP bhej dunga, phir OTP verify karke login ho jaoge."
      : "Enter your email. We will send an OTP and verify it here.",
    emailPlaceholder: "you@email.com",
    otpPlaceholder: hinglish ? "OTP daalo" : "Enter OTP",
    sendLabel: hinglish ? "OTP bhejo" : "Send OTP",
    verifyLabel: hinglish ? "Verify karke login" : "Verify and login",
    changeEmailLabel: hinglish ? "Email badlo" : "Change email",
  };
};

export const logoutConfirmCard = (language = "en") => {
  if (language === "hi") {
    return {
      type: "logout_confirm",
      title: "लॉगआउट confirm करें",
      message: "क्या आप सच में logout करना चाहते हैं?",
      confirmLabel: "हाँ, logout",
      cancelLabel: "नहीं",
    };
  }
  const hinglish = language === "hinglish";
  return {
    type: "logout_confirm",
    title: hinglish ? "Logout confirm karo" : "Confirm logout",
    message: hinglish ? "Kya aap sach mein logout karna chahte ho?" : "Do you want to logout from this account?",
    confirmLabel: hinglish ? "Haan, logout" : "Yes, logout",
    cancelLabel: hinglish ? "Nahi" : "No",
  };
};

export const countSummaryCard = (counts = {}, options = {}) => {
  const allKeys = ["cart", "wishlist", "orders", "addresses"];
  const keys = Array.isArray(options.keys) && options.keys.length
    ? options.keys.filter((key) => allKeys.includes(key))
    : allKeys;
  const actionMap = {
    cart: { label: "View cart", type: "link", href: "/cart" },
    orders: { label: "View orders", type: "link", href: "/orders" },
    wishlist: { label: "View wishlist", type: "link", href: "/wishlist" },
    addresses: { label: "View addresses", type: "link", href: "/profile" },
  };

  return {
    type: "count_summary",
    title: options.title || (keys.length === 1 ? `${keys[0][0].toUpperCase()}${keys[0].slice(1)} count` : "Your account summary"),
    counts: keys.reduce((next, key) => {
      next[key] = Number(counts[key] || 0);
      return next;
    }, {}),
    actions: keys.map((key) => actionMap[key]).filter(Boolean),
  };
};

export const orderLookupCard = () => ({
  type: "order_lookup",
  title: "Track your order",
  message: "Enter your Order ID to see safe tracking details.",
  placeholder: "Enter Order ID",
});

export const policyCard = (title, content, href) => ({
  type: "policy",
  title,
  content,
  actions: href ? [{ label: "Read more", type: "link", href }] : [],
});

export const supportCard = () => ({
  type: "support",
  title: "Support",
  message: "Share your issue from the support page and our team will help.",
  fields: ["issueType", "message"],
  actions: [{ label: "Contact Support", type: "link", href: "/support" }],
});

export const textCard = (content) => ({ type: "text", content });
