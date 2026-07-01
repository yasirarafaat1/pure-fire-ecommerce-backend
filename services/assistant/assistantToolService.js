import Products from "../../model/product.model.js";
import Orders from "../../model/orders.model.js";
import Profile from "../../model/profile.model.js";
import Wishlist from "../../model/wishlist.model.js";
import Addresses from "../../model/addresses.model.js";
import Cart from "../../model/cart.model.js";
import Catagories from "../../model/catagory.model.js";
import UserActivity from "../../model/activity.model.js";
import { buildProductSearchFilter, buildTokenRegex, parseSearchQuery } from "../../utils/search.js";
import {
  addressCard,
  countSummaryCard,
  loginOtpCard,
  loginPromptCard,
  logoutConfirmCard,
  orderCard,
  orderLookupCard,
  policyCard,
  productCard,
  profileCard,
  supportCard,
  textCard,
  wishlistCard,
} from "./assistantCardFactory.js";

const defaultSuggestions = ["Find products", "Track order", "Best sellers", "Return policy"];
const genericProductQueries = new Set(["", "find", "show", "search", "products", "product", "items", "shopping"]);

const detectReplyLanguage = (message = "") => {
  const text = String(message || "");
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/\b(karna|krna|karo|mujhe|mera|meri|mere|haan|nahi|hai|btao|batao|kitne|kitni|chahiye|chaiye|dikhao|batao)\b/i.test(text)) {
    return "hinglish";
  }
  return "en";
};

const replyText = (language, english, hinglish, hindi) => {
  if (language === "hi") return hindi;
  if (language === "hinglish") return hinglish;
  return english;
};

const buildProductFilter = async (query) => {
  const parsed = parseSearchQuery(query);
  const categoryTokenMap = new Map();
  if (parsed.textTokens?.length) {
    await Promise.all(
      parsed.textTokens.map(async (token) => {
        const regex = buildTokenRegex(token);
        if (!regex) return categoryTokenMap.set(token, []);
        const cats = await Catagories.find({
          $or: [{ name: regex }, { "ancestors.name": regex }],
        }).select("_id");
        categoryTokenMap.set(token, cats.map((cat) => cat._id));
      })
    );
  }
  const { filter } = buildProductSearchFilter(query, { parsed, categoryTokenMap });
  const finalFilter = filter.$and ? { ...filter, $and: [...filter.$and, { status: "published" }] } : { ...filter, status: "published" };
  return finalFilter;
};

const getProducts = async ({ query = "", sort = { product_id: -1 }, limit = 6 } = {}) => {
  const filter = query ? await buildProductFilter(query) : { status: "published" };
  return Products.find(filter)
    .sort(sort)
    .limit(limit)
    .populate({ path: "catagory_id", select: "name" })
    .lean();
};

const uniqueProducts = (rows = []) => {
  const seen = new Set();
  return rows.filter((product) => {
    const id = String(product?.product_id || product?._id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const categorySuggestions = async (products = [], fallbackQuery = "") => {
  const names = [];
  products.forEach((product) => {
    if (typeof product?.catagory_id === "object" && product.catagory_id?.name) {
      names.push(product.catagory_id.name);
    }
  });
  if (names.length < 4) {
    const cats = await Catagories.find({ status: { $ne: "INACTIVE" } })
      .sort({ sortOrder: 1, name: 1 })
      .limit(8)
      .lean();
    cats.forEach((cat) => names.push(cat.name));
  }
  const unique = Array.from(new Set(names.map((name) => String(name || "").trim()).filter(Boolean)));
  const categoryChips = unique.slice(0, 4);
  if (fallbackQuery && !categoryChips.includes(fallbackQuery)) {
    return [...categoryChips, fallbackQuery].slice(0, 4);
  }
  return categoryChips;
};

const getBestSellers = async () => {
  const rows = await Orders.aggregate([
    { $unwind: "$items" },
    { $group: { _id: "$items.product_id", orderedQty: { $sum: "$items.quantity" } } },
    { $sort: { orderedQty: -1 } },
    { $limit: 12 },
  ]);
  const ids = rows.map((row) => row._id);
  if (!ids.length) return getProducts({ limit: 6 });
  const products = await Products.find({ product_id: { $in: ids }, status: "published" })
    .populate({ path: "catagory_id", select: "name" })
    .lean();
  const map = new Map(products.map((product) => [product.product_id, product]));
  return ids.map((id) => map.get(id)).filter(Boolean).slice(0, 6);
};

const getBehaviorProducts = async (email, limit = 6) => {
  if (!email) return [];
  const activity = await UserActivity.findOne({ email }).lean();
  if (!activity) return [];

  const recentViewed = Array.isArray(activity.recent_viewed) ? activity.recent_viewed : [];
  const recentSearches = Array.isArray(activity.recent_searches) ? activity.recent_searches : [];
  const products = [];

  if (recentViewed.length) {
    const viewed = await Products.find({ product_id: { $in: recentViewed }, status: "published" })
      .select("product_id catagory_id")
      .lean();
    const catIds = Array.from(new Set(viewed.map((product) => String(product.catagory_id || "")).filter(Boolean)));
    if (catIds.length) {
      products.push(
        ...(await Products.find({ catagory_id: { $in: catIds }, status: "published" })
          .sort({ product_id: -1 })
          .limit(limit)
          .populate({ path: "catagory_id", select: "name" })
          .lean())
      );
    }
  }

  for (const query of recentSearches.slice(0, 3)) {
    if (products.length >= limit) break;
    products.push(...(await getProducts({ query, limit })));
  }

  return uniqueProducts(products).slice(0, limit);
};

const getFallbackProducts = async ({ email = "", limit = 6 } = {}) => {
  const behavior = await getBehaviorProducts(email, limit);
  if (behavior.length) return { products: behavior, source: "behavior" };

  const best = await getBestSellers();
  if (best.length) return { products: best, source: "best_sellers" };

  const latest = await getProducts({ sort: { createdAt: -1 }, limit });
  if (latest.length) return { products: latest, source: "new_arrivals" };

  const published = await getProducts({ limit });
  return { products: published, source: "published" };
};

const getSmartSearchProducts = async ({ query = "", email = "", limit = 6 } = {}) => {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery || genericProductQueries.has(cleanQuery.toLowerCase())) {
    return getFallbackProducts({ email, limit });
  }

  const exact = await getProducts({ query: cleanQuery, limit });
  if (exact.length) return { products: exact, source: "search" };

  const parsed = parseSearchQuery(cleanQuery);
  for (const token of parsed.textTokens || []) {
    const tokenProducts = await getProducts({ query: token, limit });
    if (tokenProducts.length) return { products: tokenProducts, source: "relaxed_search" };
  }

  return getFallbackProducts({ email, limit });
};

const getUserOrders = async (email, limit = 5) =>
  Orders.find({ user_email: email }).sort({ createdAt: -1 }).limit(limit).lean();

const getCartCount = async (cartId = "") => {
  if (!cartId) return 0;
  const cart = await Cart.findOne({ cart_id: cartId }).select("items.qty").lean();
  return (cart?.items || []).reduce((sum, item) => sum + Number(item.qty || 1), 0);
};

const getAccountCounts = async ({ userEmail = "", cartId = "" }) => {
  const [cart, wishlist, orders, addresses] = await Promise.all([
    getCartCount(cartId),
    userEmail ? Wishlist.countDocuments({ email: userEmail }) : Promise.resolve(0),
    userEmail ? Orders.countDocuments({ user_email: userEmail }) : Promise.resolve(0),
    userEmail ? Addresses.countDocuments({ email: userEmail }) : Promise.resolve(0),
  ]);
  return { cart, wishlist, orders, addresses };
};

const policies = {
  shipping_policy: {
    title: "Shipping policy",
    content: "Orders are processed as quickly as possible. Delivery timelines depend on serviceability, courier availability, and destination pincode.",
    href: "/shipping-info",
  },
  return_policy: {
    title: "Return and refund policy",
    content: "Returns, exchanges, and refunds depend on product eligibility and request timing. Open the policy page for complete terms.",
    href: "/return-policy",
  },
  payment_policy: {
    title: "Payment help",
    content: "You can complete checkout with the available payment methods shown at checkout. Payment status is always based on real order records.",
    href: "/terms-and-conditions",
  },
};

const safePageTitle = (context = {}) =>
  String(context.title || context.productTitle || context.collectionSlug || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

const getProductFromContext = async (context = {}) => {
  const rawId = String(context.productId || "").trim();
  const title = safePageTitle(context);
  const numericId = Number(rawId);
  const filters = [];

  if (Number.isFinite(numericId) && numericId > 0) {
    filters.push({ product_id: numericId });
  }

  if (/^[a-f\d]{24}$/i.test(rawId)) {
    filters.push({ _id: rawId });
  }

  if (filters.length) {
    const product = await Products.findOne({ $or: filters, status: "published" })
      .populate({ path: "catagory_id", select: "name" })
      .lean();
    if (product) return product;
  }

  if (title) {
    const result = await getSmartSearchProducts({ query: title, limit: 1 });
    return result.products?.[0] || null;
  }

  return null;
};

const buildPageContextResponse = async ({ context = {}, userEmail = "", isAuthenticated = false, cartId = "" }) => {
  const pageType = String(context.pageType || "").trim();
  const title = safePageTitle(context);

  if (pageType === "product") {
    const product = await getProductFromContext(context);
    if (product) {
      const categoryProducts = product.catagory_id
        ? await Products.find({
            catagory_id: typeof product.catagory_id === "object" ? product.catagory_id._id : product.catagory_id,
            product_id: { $ne: product.product_id },
            status: "published",
          })
            .sort({ product_id: -1 })
            .limit(3)
            .populate({ path: "catagory_id", select: "name" })
            .lean()
        : [];

      return {
        message: `You are viewing ${product.name || product.title || "this product"}. I can help with stock, price, similar products, or checkout.`,
        cards: [productCard(product, ["Current product"]), ...categoryProducts.map((row) => productCard(row, ["Similar"]))],
        suggestions: ["Buy now", "Add to cart", "Similar products", "Is it in stock?"],
      };
    }

    return {
      message: title ? `You are viewing ${title}. I can help find matching products or similar items.` : "You are viewing a product page. I can help find details or similar items.",
      cards: [],
      suggestions: ["Similar products", "Best sellers", "New arrivals", "Under 1000"],
    };
  }

  if (pageType === "collection") {
    const result = await getSmartSearchProducts({ query: title || context.collectionSlug || "", email: userEmail, limit: 6 });
    return {
      message: title ? `You are browsing ${title}. Here are products you can explore from this context.` : "Here are products you can explore.",
      cards: result.products.map((product) => productCard(product)),
      suggestions: ["Best sellers", "New arrivals", "Under 1000", "Track order"],
    };
  }

  if (pageType === "profile") {
    if (!isAuthenticated) {
      return {
        message: "Login is required to view profile details.",
        cards: [loginPromptCard("Login to view your profile, orders, wishlist, and addresses.")],
        suggestions: ["Login", "Find products", "Track order"],
      };
    }
    const counts = await getAccountCounts({ userEmail, cartId });
    return {
      message: "You are on your profile page. Here is your account summary.",
      cards: [countSummaryCard(counts)],
      suggestions: ["My profile", "My orders", "Wishlist", "Addresses"],
    };
  }

  if (pageType === "orders" || pageType === "order_detail") {
    if (!isAuthenticated) {
      return {
        message: "Login is required for your order history. You can still track by Order ID.",
        cards: [orderLookupCard()],
        suggestions: ["Track order", "Login", "Shipping policy"],
      };
    }
    const orderId = context.orderId ? Number(String(context.orderId).replace(/\D/g, "")) : 0;
    const filter = orderId ? { user_email: userEmail, order_id: orderId } : { user_email: userEmail };
    const orders = await Orders.find(filter).sort({ createdAt: -1 }).limit(orderId ? 1 : 4).lean();
    return {
      message: orderId ? "You are viewing this order. Here is its latest saved status." : "You are on your orders page. Here are recent orders.",
      cards: orders.length ? orders.map((order) => orderCard(order)) : [textCard("No matching order found.")],
      suggestions: ["Track order", "Shipping policy", "Support"],
    };
  }

  if (pageType === "wishlist") {
    if (!isAuthenticated) {
      return {
        message: "Login is required to view your wishlist.",
        cards: [loginPromptCard("Login to view saved wishlist products.")],
        suggestions: ["Login", "Best sellers", "Find products"],
      };
    }
    const rows = await Wishlist.find({ email: userEmail }).lean();
    const ids = rows.map((row) => row.product_id);
    const products = await Products.find({ product_id: { $in: ids }, status: "published" }).lean();
    return {
      message: "You are on your wishlist. I can help compare or buy saved products.",
      cards: [wishlistCard(products)],
      suggestions: ["Similar products", "Best sellers", "Cart count"],
    };
  }

  if (pageType === "checkout") {
    const counts = await getAccountCounts({ userEmail: isAuthenticated ? userEmail : "", cartId });
    return {
      message: "You are at checkout. I can help with cart count, address, payment, and delivery questions.",
      cards: [countSummaryCard(counts)],
      suggestions: isAuthenticated ? ["My addresses", "Payment help", "Shipping policy"] : ["Login", "Payment help", "Shipping policy"],
    };
  }

  if (pageType === "policy") {
    const normalizedTitle = title.toLowerCase();
    const policyKey = normalizedTitle.includes("shipping")
      ? "shipping_policy"
      : normalizedTitle.includes("return") || normalizedTitle.includes("refund")
        ? "return_policy"
        : "payment_policy";
    const policy = policies[policyKey];
    return {
      message: `You are reading ${title || policy.title}. Here is the short version.`,
      cards: [policyCard(policy.title, policy.content, policy.href)],
      suggestions: ["Find products", "Track order", "Support"],
    };
  }

  if (pageType === "support") {
    return {
      message: "You are on support. I can help route order, return, payment, or delivery questions.",
      cards: [supportCard()],
      suggestions: ["Track order", "Return policy", "Payment help"],
    };
  }

  return {
    message: "I can help with this page, products, orders, cart, wishlist, policies, and support.",
    cards: [textCard("Ask about this page, products, order tracking, or account details.")],
    suggestions: defaultSuggestions,
  };
};

export const runAssistantTool = async ({ intent, message, auth, context = {}, orderId }) => {
  const userEmail = auth?.email || "";
  const isAuthenticated = Boolean(auth?.isAuthenticated && userEmail);
  const cartId = context?.cartId || context?.cart_id || "";
  const hasPageContext = Boolean(context?.pageType && context.pageType !== "home");

  if (!isAuthenticated && ["profile_summary", "my_orders", "latest_order", "wishlist_view", "address_view"].includes(intent)) {
    return {
      message: "Please login to view your account details.",
      cards: [loginPromptCard("Login to view your profile, orders, wishlist, and saved addresses.")],
      suggestions: ["Login", "Find products", "Track order"],
    };
  }

  switch (intent) {
    case "page_context":
      return buildPageContextResponse({ context, userEmail, isAuthenticated, cartId });
    case "product_detail": {
      if (context?.pageType === "product" || context?.productId) {
        return buildPageContextResponse({ context: { ...context, pageType: "product" }, userEmail, isAuthenticated, cartId });
      }
      const result = await getSmartSearchProducts({ query: message, email: userEmail, limit: 4 });
      return {
        message: result.products.length ? "I found product details you can open from these cards." : "Tell me which product you want details for.",
        cards: result.products.map((product) => productCard(product)),
        suggestions: ["Best sellers", "New arrivals", "Find products"],
      };
    }
    case "greeting":
      if (hasPageContext) {
        return buildPageContextResponse({ context, userEmail, isAuthenticated, cartId });
      }
      return {
        message: "Hi, I can help you find products, track orders, and answer shopping questions.",
        cards: [textCard("Try asking for best sellers, new arrivals, or order status.")],
        suggestions: defaultSuggestions,
      };
    case "login_start": {
      const language = detectReplyLanguage(message);
      if (isAuthenticated) {
        const counts = await getAccountCounts({ userEmail, cartId });
        return {
          message: replyText(language, "You are already logged in.", "Aap already login ho.", "आप पहले से लॉगिन हैं।"),
          cards: [countSummaryCard(counts)],
          suggestions: ["My orders", "Wishlist", "Cart"],
        };
      }
      return {
        message: replyText(
          language,
          "Login with your email and OTP.",
          "Login ke liye email aur OTP verify kar lo.",
          "लॉगिन के लिए अपना ईमेल और OTP verify करें।",
        ),
        cards: [loginOtpCard(language)],
        suggestions: ["Find products", "Track order", "Return policy"],
      };
    }
    case "logout_confirm": {
      const language = detectReplyLanguage(message);
      if (!isAuthenticated) {
        return {
          message: replyText(language, "You are not logged in right now.", "Aap abhi login nahi ho.", "आप अभी लॉगिन नहीं हैं।"),
          cards: [loginOtpCard(language)],
          suggestions: ["Login", "Find products", "Track order"],
        };
      }
      return {
        message: replyText(
          language,
          "Please confirm before logging out.",
          "Logout karne se pehle confirm kar do.",
          "लॉगआउट करने से पहले confirm करें।",
        ),
        cards: [logoutConfirmCard(language)],
        suggestions: ["No", "My orders", "Wishlist"],
      };
    }
    case "account_counts": {
      const counts = await getAccountCounts({ userEmail: isAuthenticated ? userEmail : "", cartId });
      const cards = [countSummaryCard(counts)];
      if (!isAuthenticated) {
        cards.push(loginPromptCard("Login to see your wishlist, orders, and saved address counts."));
      }
      return {
        message: isAuthenticated
          ? "Here are your cart, wishlist, order, and address counts."
          : "I can show your cart count here. Login is required for private account counts.",
        cards,
        suggestions: isAuthenticated ? ["View cart", "My orders", "Wishlist"] : ["Login", "Find products", "Track order"],
      };
    }
    case "best_sellers": {
      let products = await getBestSellers();
      if (!products.length) {
        products = (await getFallbackProducts({ email: userEmail })).products;
      }
      const categories = await categorySuggestions(products);
      return {
        message: products.length ? "Here are the current best sellers." : "I found popular products for you.",
        cards: products.map((product) => productCard(product, ["Best seller"])),
        suggestions: [...categories, "New arrivals", "Under 1000"].slice(0, 6),
      };
    }
    case "new_arrivals": {
      let products = await getProducts({ sort: { createdAt: -1 }, limit: 6 });
      if (!products.length) {
        products = (await getFallbackProducts({ email: userEmail })).products;
      }
      const categories = await categorySuggestions(products);
      return {
        message: products.length ? "Here are the latest arrivals." : "I found available products for you.",
        cards: products.map((product) => productCard(product, ["New"])),
        suggestions: [...categories, "Best sellers", "Wishlist"].slice(0, 6),
      };
    }
    case "product_recommendation":
    case "product_search": {
      const result = await getSmartSearchProducts({ query: message, email: userEmail, limit: 6 });
      const products = result.products;
      const categories = await categorySuggestions(products, message);
      const fallbackMessage =
        result.source === "behavior"
          ? "Based on your recent activity, these products may fit you."
          : result.source === "search" || result.source === "relaxed_search"
            ? "I found these products for you."
            : "I found popular products you can explore.";
      return {
        message: fallbackMessage,
        cards: products.map((product) => productCard(product)),
        suggestions: [...categories, "Best sellers", "New arrivals"].slice(0, 6),
      };
    }
    case "profile_summary": {
      const [profile, addresses] = await Promise.all([
        Profile.findOne({ email: userEmail }).lean(),
        Addresses.find({ email: userEmail }).sort({ createdAt: -1 }).limit(1).lean(),
      ]);
      return {
        message: "Here is your profile summary.",
        cards: [profileCard({ profile, email: userEmail, phone: addresses?.[0]?.phone1 || addresses?.[0]?.phone })],
        suggestions: ["My orders", "Wishlist", "Addresses"],
      };
    }
    case "my_orders": {
      const orders = await getUserOrders(userEmail, 5);
      return {
        message: orders.length ? "Here are your recent orders." : "You do not have any orders yet.",
        cards: orders.map((order) => orderCard(order)),
        suggestions: ["Latest order", "Find products", "Support"],
      };
    }
    case "latest_order": {
      const orders = await getUserOrders(userEmail, 1);
      return {
        message: orders.length ? "Here is your latest order." : "You do not have any orders yet.",
        cards: orders.map((order) => orderCard(order)),
        suggestions: ["My orders", "Track order", "Support"],
      };
    }
    case "order_status": {
      if (isAuthenticated) {
        const filter = orderId ? { user_email: userEmail, order_id: Number(orderId) } : { user_email: userEmail };
        const order = await Orders.findOne(filter).sort({ createdAt: -1 }).lean();
        return {
          message: order ? "Here is your order status." : "I could not find that order in your account.",
          cards: order ? [orderCard(order)] : [textCard("No matching order found.")],
          suggestions: ["My orders", "Support", "Find products"],
        };
      }
      if (!orderId) {
        return {
          message: "Please enter your Order ID to track it.",
          cards: [orderLookupCard()],
          suggestions: ["Find products", "Shipping policy"],
        };
      }
      return lookupOrderById({ orderId, isAuthenticated: false });
    }
    case "wishlist_view": {
      const rows = await Wishlist.find({ email: userEmail }).lean();
      const ids = rows.map((row) => row.product_id);
      const products = await Products.find({ product_id: { $in: ids }, status: "published" }).lean();
      return {
        message: products.length ? "Here is your wishlist." : "Your wishlist is empty.",
        cards: [wishlistCard(products)],
        suggestions: ["Find products", "Best sellers", "Cart"],
      };
    }
    case "address_view": {
      const addresses = await Addresses.find({ email: userEmail }).sort({ createdAt: -1 }).limit(4).lean();
      return {
        message: addresses.length ? "Here are your saved addresses." : "No saved addresses found.",
        cards: addresses.map((address, index) => addressCard(address, index)),
        suggestions: ["My orders", "Profile", "Support"],
      };
    }
    case "cart_view": {
      if (!cartId) {
        return {
          message: "Your cart looks empty on this device.",
          cards: [textCard("Add products to your cart and I can summarize them here.")],
          suggestions: ["Find products", "Best sellers"],
        };
      }
      const cart = await Cart.findOne({ cart_id: cartId }).lean();
      const products = (cart?.items || []).slice(0, 6).map((item) =>
        productCard({
          product_id: item.product_id,
          name: item.title,
          price: item.mrp,
          selling_price: item.price,
          product_image: item.image ? [item.image] : [],
        })
      );
      return {
        message: cart?.items?.length ? `Your cart has ${cart.items.length} item(s).` : "Your cart is empty.",
        cards: products,
        suggestions: ["Checkout", "Find products", "Wishlist"],
      };
    }
    case "shipping_policy":
    case "return_policy":
    case "payment_policy": {
      const policy = policies[intent];
      return { message: policy.title, cards: [policyCard(policy.title, policy.content, policy.href)], suggestions: defaultSuggestions };
    }
    case "support_request":
      return { message: "Support is available from the support page.", cards: [supportCard()], suggestions: ["Track order", "Return policy"] };
    default:
      if (hasPageContext) {
        return buildPageContextResponse({ context, userEmail, isAuthenticated, cartId });
      }
      return {
        message: "I can help with products, order tracking, policies, cart, wishlist, and profile questions.",
        cards: [textCard("Try: best sellers, my orders, return policy, or products under 1000.")],
        suggestions: defaultSuggestions,
      };
  }
};

export const lookupOrderById = async ({ orderId, userEmail = "", isAuthenticated = false }) => {
  const numericId = Number(String(orderId || "").replace(/\D/g, ""));
  if (!numericId) {
    return {
      message: "Please enter a valid Order ID.",
      cards: [orderLookupCard()],
      suggestions: ["Track order", "Support"],
    };
  }
  const filter = isAuthenticated && userEmail ? { order_id: numericId, user_email: userEmail } : { order_id: numericId };
  const order = await Orders.findOne(filter).lean();
  if (!order) {
    return {
      message: "No order found for that Order ID.",
      cards: [orderLookupCard()],
      suggestions: ["Check Order ID", "Support"],
    };
  }
  return {
    message: "Here is the order status I found.",
    cards: [orderCard(order, { limited: !isAuthenticated })],
    suggestions: ["Shipping policy", "Support", "Find products"],
  };
};
