import UserSession from "../model/session.model.js";

export const detectAssistantAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const tokenHeader = req.headers["x-user-token"] || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const token = String(bearer || tokenHeader || "").trim();
    if (!token) {
      req.assistantAuth = { isAuthenticated: false, email: "" };
      return next();
    }

    const session = await UserSession.findOne({ token }).lean();
    if (!session || (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now())) {
      req.assistantAuth = { isAuthenticated: false, email: "" };
      return next();
    }

    req.assistantAuth = { isAuthenticated: true, email: session.email || "" };
    return next();
  } catch {
    req.assistantAuth = { isAuthenticated: false, email: "" };
    return next();
  }
};
