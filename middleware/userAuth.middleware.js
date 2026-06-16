import UserSession from "../model/session.model.js";

export const requireUserAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const tokenHeader = req.headers["x-user-token"] || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const token = String(bearer || tokenHeader || "").trim();
    if (!token) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const session = await UserSession.findOne({ token }).lean();
    if (!session) {
      return res.status(401).json({ status: false, message: "Session expired" });
    }
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      await UserSession.deleteOne({ token });
      return res.status(401).json({ status: false, message: "Session expired" });
    }

    req.user = { email: session.email };
    next();
  } catch (error) {
    return res.status(500).json({ status: false, message: "Auth error" });
  }
};
