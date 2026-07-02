export const ADMIN_PERMISSIONS = {
  SUPER_ADMIN: ["*"],
  MANAGER: [
    "dashboard.read",
    "products.manage",
    "categories.manage",
    "inventory.manage",
    "orders.manage",
    "customers.read",
    "customers.manage",
    "reviews.manage",
    "coupons.manage",
    "banners.manage",
    "shipping.manage",
    "payments.read",
    "returns.manage",
    "notifications.manage",
  ],
  SUPPORT: [
    "dashboard.read",
    "orders.read",
    "orders.manage",
    "customers.read",
    "returns.manage",
    "reviews.read",
    "reviews.manage",
    "shipping.read",
    "payments.read",
    "notifications.read",
  ],
  CONTENT: [
    "dashboard.read",
    "products.manage",
    "categories.manage",
    "inventory.read",
    "banners.manage",
    "reviews.read",
    "reviews.manage",
  ],
};

export const hasAdminPermission = (role, permission) => {
  const permissions = ADMIN_PERMISSIONS[role] || [];
  const managePermission = permission.endsWith(".read")
    ? permission.replace(/\.read$/, ".manage")
    : "";
  return (
    permissions.includes("*") ||
    permissions.includes(permission) ||
    (managePermission && permissions.includes(managePermission))
  );
};

export const requireAdminPermission = (permission) => (req, res, next) => {
  if (!req.admin || !hasAdminPermission(req.admin.role, permission)) {
    return res.status(403).json({ status: false, message: "Admin permission denied" });
  }
  next();
};
