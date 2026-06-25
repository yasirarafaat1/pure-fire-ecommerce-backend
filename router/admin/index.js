import { Router } from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.middleware.js";
import { adminApiRateLimit } from "../../middleware/adminRateLimit.middleware.js";
import authRoutes from "./admin.auth.routes.js";
import auditRoutes from "./admin.audit.routes.js";
import bannerRoutes from "./admin.banners.routes.js";
import categoryRoutes from "./admin.categories.routes.js";
import couponRoutes from "./admin.coupons.routes.js";
import customerRoutes from "./admin.customers.routes.js";
import dashboardRoutes from "./admin.dashboard.routes.js";
import notificationRoutes from "./admin.notifications.routes.js";
import operationRoutes from "./admin.operations.routes.js";
import invoiceRoutes from "./admin.invoices.routes.js";
import orderRoutes from "./admin.orders.routes.js";
import productRoutes from "./admin.products.routes.js";
import reviewRoutes from "./admin.reviews.routes.js";
import settingsRoutes from "./admin.settings.routes.js";
import userRoutes from "./admin.users.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use(adminApiRateLimit, requireAdminAuth);
router.use("/dashboard", dashboardRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/orders", orderRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/customers", customerRoutes);
router.use("/reviews", reviewRoutes);
router.use("/banners", bannerRoutes);
router.use("/coupons", couponRoutes);
router.use("/settings", settingsRoutes);
router.use("/users", userRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/notifications", notificationRoutes);
router.use("/", operationRoutes);

export default router;
