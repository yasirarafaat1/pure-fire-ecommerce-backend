import Admin from "../../model/admin.model.js";
import {
  hashAdminPassword,
  needsAdminPasswordRehash,
  validateAdminPassword,
  verifyAdminPassword,
} from "../../utils/adminPassword.js";
import {
  buildAdminCookie,
  signAdminSession,
} from "../../utils/adminSession.js";
import { writeAdminAudit } from "../../utils/adminAudit.js";

const publicAdmin = (admin) => ({
  id: admin._id,
  name: admin.name || "",
  email: admin.email || "",
  username: admin.username || "",
  role: admin.role,
  status: admin.status,
  lastLoginAt: admin.lastLoginAt,
});

export const loginAdmin = async (req, res) => {
  const identity = String(req.body?.email || req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!identity || !password) {
    return res.status(400).json({ status: false, message: "Email and password are required" });
  }

  const admin = await Admin.findOne({
    $or: [{ email: identity }, { username: identity }],
  });
  if (!admin || !verifyAdminPassword(password, admin.salt, admin.passwordHash)) {
    await writeAdminAudit(req, {
      action: "ADMIN_LOGIN_FAILED",
      entityType: "ADMIN",
      metadata: { identity },
      admin: null,
    });
    return res.status(401).json({ status: false, message: "Invalid credentials" });
  }
  if (admin.status !== "ACTIVE") {
    return res.status(403).json({ status: false, message: "Admin account is disabled" });
  }

  if (needsAdminPasswordRehash(password, admin.salt, admin.passwordHash)) {
    const upgraded = hashAdminPassword(password);
    admin.salt = upgraded.salt;
    admin.passwordHash = upgraded.passwordHash;
  }
  admin.lastLoginAt = new Date();
  await admin.save();
  const token = signAdminSession({
    adminId: admin._id,
    passwordVersion: admin.passwordVersion,
  });
  res.setHeader("Set-Cookie", buildAdminCookie(token));
  await writeAdminAudit(req, {
    action: "ADMIN_LOGIN",
    entityType: "ADMIN",
    entityId: admin._id,
    admin,
  });
  return res.json({ status: true, admin: publicAdmin(admin) });
};

export const logoutAdmin = async (req, res) => {
  res.setHeader("Set-Cookie", buildAdminCookie("", { clear: true }));
  await writeAdminAudit(req, {
    action: "ADMIN_LOGOUT",
    entityType: "ADMIN",
    entityId: req.admin._id,
  });
  return res.json({ status: true, message: "Logged out" });
};

export const getCurrentAdmin = async (req, res) =>
  res.json({ status: true, admin: publicAdmin(req.admin) });

export const changeAdminPassword = async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  const passwordError = validateAdminPassword(newPassword);
  if (!currentPassword || passwordError) {
    return res.status(400).json({
      status: false,
      message: passwordError || "Current password is required",
    });
  }

  const admin = await Admin.findById(req.admin._id);
  if (!admin || !verifyAdminPassword(currentPassword, admin.salt, admin.passwordHash)) {
    return res.status(401).json({ status: false, message: "Current password is incorrect" });
  }
  const next = hashAdminPassword(newPassword);
  admin.salt = next.salt;
  admin.passwordHash = next.passwordHash;
  admin.passwordVersion = Number(admin.passwordVersion || 1) + 1;
  await admin.save();
  res.setHeader("Set-Cookie", buildAdminCookie("", { clear: true }));
  await writeAdminAudit(req, {
    action: "ADMIN_PASSWORD_CHANGED",
    entityType: "ADMIN",
    entityId: admin._id,
  });
  return res.json({ status: true, message: "Password updated. Sign in again." });
};
