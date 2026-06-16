import { writeAdminAudit } from "../utils/adminAudit.js";

export const auditAdminAction = (action, entityType, getEntityId) => (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      const entityId = getEntityId ? getEntityId(req, res) : req.params.id || "";
      void writeAdminAudit(req, {
        action,
        entityType,
        entityId,
        metadata: {
          method: req.method,
          path: req.originalUrl,
        },
      });
    }
  });
  next();
};
