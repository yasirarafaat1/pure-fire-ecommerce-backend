import Admin from "../model/admin.model.js";
import {
  getAdminCookieName,
  parseCookies,
  verifyAdminSession,
} from "../utils/adminSession.js";

const readToken = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[getAdminCookieName()];
  const authorization = String(req.headers.authorization || "");
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return cookieToken || bearer;
};

export const requireAdminAuth = async (req, res, next) => {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ status: false, message: "Admin authentication required" });
    }

    const payload = verifyAdminSession(token);
    const admin = await Admin.findById(payload.sub).select("-passwordHash -salt").lean();
    if (!admin || admin.status !== "ACTIVE") {
      return res.status(401).json({ status: false, message: "Admin account is inactive" });
    }
    if (Number(admin.passwordVersion || 1) !== Number(payload.pv || 1)) {
      return res.status(401).json({ status: false, message: "Admin session expired" });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ status: false, message: "Invalid or expired admin session" });
  }
};
