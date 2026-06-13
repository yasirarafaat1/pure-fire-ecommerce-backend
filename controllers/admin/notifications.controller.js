import AdminNotification from "../../model/adminNotification.model.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

export const listNotifications = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const q = String(req.query.q || "").trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: regex }, { message: regex }];
  }
  const [data, total] = await Promise.all([
    AdminNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdminNotification.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const createNotification = async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const message = String(req.body?.message || "").trim();
  if (!title || !message) {
    return res.status(400).json({ status: false, message: "Title and message are required" });
  }
  const notification = await AdminNotification.create({
    title,
    message,
    type: req.body?.type || "INFO",
    target: String(req.body?.target || "ADMIN"),
    status: req.body?.status || "ACTIVE",
  });
  return res.status(201).json({ status: true, data: notification });
};

export const updateNotification = async (req, res) => {
  const notification = await AdminNotification.findByIdAndUpdate(
    req.params.id,
    {
      title: String(req.body?.title || "").trim(),
      message: String(req.body?.message || "").trim(),
      type: req.body?.type || "INFO",
      target: String(req.body?.target || "ADMIN"),
      status: req.body?.status || "ACTIVE",
    },
    { new: true, runValidators: true }
  ).lean();
  if (!notification) {
    return res.status(404).json({ status: false, message: "Notification not found" });
  }
  return res.json({ status: true, data: notification });
};

export const deleteNotification = async (req, res) => {
  const notification = await AdminNotification.findByIdAndDelete(req.params.id);
  if (!notification) {
    return res.status(404).json({ status: false, message: "Notification not found" });
  }
  return res.json({ status: true, message: "Notification deleted" });
};
