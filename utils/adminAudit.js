import AdminAudit from "../model/adminAudit.model.js";

const requestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();

export const writeAdminAudit = async (
  req,
  { action, entityType, entityId = "", metadata = {}, admin = req.admin }
) => {
  try {
    await AdminAudit.create({
      adminId: admin?._id,
      adminEmail: admin?.email || admin?.username || "",
      action,
      entityType,
      entityId: String(entityId || ""),
      metadata,
      ip: requestIp(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    });
  } catch (error) {
    console.error("Admin audit write failed:", error.message);
  }
};
