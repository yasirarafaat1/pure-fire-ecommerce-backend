import AdminAudit from "../../model/adminAudit.model.js";
import {
  dateRangeFilter,
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

export const listAuditLogs = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { ...dateRangeFilter(req.query) };
  if (req.query.action) filter.action = req.query.action;
  if (req.query.entityType) filter.entityType = req.query.entityType;
  const q = String(req.query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ adminEmail: regex }, { action: regex }, { entityId: regex }];
  }
  const [data, total] = await Promise.all([
    AdminAudit.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdminAudit.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};
