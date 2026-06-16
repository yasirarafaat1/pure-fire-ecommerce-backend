import Admin from "../../model/admin.model.js";
import {
  hashAdminPassword,
  validateAdminPassword,
} from "../../utils/adminPassword.js";
import {
  escapeRegex,
  paginationPayload,
  parsePagination,
} from "../../utils/adminQuery.js";

const roles = ["SUPER_ADMIN", "MANAGER", "SUPPORT", "CONTENT"];
const statuses = ["ACTIVE", "DISABLED"];

export const listAdminUsers = async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q || "").trim();
  const regex = q ? new RegExp(escapeRegex(q), "i") : null;
  const filter = regex ? { $or: [{ name: regex }, { email: regex }] } : {};
  const [data, total] = await Promise.all([
    Admin.find(filter)
      .select("-passwordHash -salt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Admin.countDocuments(filter),
  ]);
  return res.json({ data, pagination: paginationPayload({ page, limit, total }) });
};

export const createAdminUser = async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "").toUpperCase();
  const passwordError = validateAdminPassword(password);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: false, message: "Valid name and email are required" });
  }
  if (!roles.includes(role) || passwordError) {
    return res.status(400).json({
      status: false,
      message: passwordError || "Invalid admin role",
    });
  }
  const credentials = hashAdminPassword(password);
  const admin = await Admin.create({
    name,
    email,
    username: email,
    role,
    status: "ACTIVE",
    ...credentials,
  });
  return res.status(201).json({
    status: true,
    data: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
    },
  });
};

export const updateAdminUser = async (req, res) => {
  const target = await Admin.findById(req.params.id);
  if (!target) return res.status(404).json({ status: false, message: "Admin not found" });
  const role = req.body?.role ? String(req.body.role).toUpperCase() : target.role;
  const status = req.body?.status ? String(req.body.status).toUpperCase() : target.status;
  if (!roles.includes(role) || !statuses.includes(status)) {
    return res.status(400).json({ status: false, message: "Invalid role or status" });
  }
  if (String(target._id) === String(req.admin._id) && status === "DISABLED") {
    return res.status(409).json({ status: false, message: "You cannot disable your own account" });
  }
  target.name = req.body?.name !== undefined ? String(req.body.name).trim() : target.name;
  target.role = role;
  target.status = status;
  if (status === "DISABLED") target.passwordVersion = Number(target.passwordVersion || 1) + 1;
  await target.save();
  return res.json({
    status: true,
    data: {
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
      status: target.status,
    },
  });
};

export const resetAdminPassword = async (req, res) => {
  const password = String(req.body?.password || "");
  const error = validateAdminPassword(password);
  if (error) return res.status(400).json({ status: false, message: error });
  const credentials = hashAdminPassword(password);
  const admin = await Admin.findByIdAndUpdate(
    req.params.id,
    {
      $set: credentials,
      $inc: { passwordVersion: 1 },
    },
    { new: true }
  );
  if (!admin) return res.status(404).json({ status: false, message: "Admin not found" });
  return res.json({ status: true, message: "Password reset. Existing sessions were revoked." });
};
