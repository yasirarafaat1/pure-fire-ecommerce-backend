import crypto from "crypto";

const base64url = (value) => Buffer.from(value).toString("base64url");

const getSecret = () => {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be configured with at least 32 characters");
  }
  return secret;
};

export const getAdminCookieName = () => {
  const name = String(process.env.ADMIN_COOKIE_NAME || "").trim();
  if (!name) throw new Error("ADMIN_COOKIE_NAME is required");
  return name;
};

export const getAdminSessionTtlSeconds = () => {
  const days = Number(process.env.ADMIN_SESSION_TTL_DAYS);
  if (!Number.isFinite(days) || days <= 0 || days > 30) {
    throw new Error("ADMIN_SESSION_TTL_DAYS must be between 1 and 30");
  }
  return Math.floor(days * 24 * 60 * 60);
};

export const validateAdminSessionConfig = () => {
  getSecret();
  getAdminCookieName();
  getAdminSessionTtlSeconds();
};

export const signAdminSession = ({ adminId, passwordVersion }) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(adminId),
    pv: Number(passwordVersion || 1),
    iat: now,
    exp: now + getAdminSessionTtlSeconds(),
  };
  const header = { alg: "HS256", typ: "JWT" };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
};

export const verifyAdminSession = (token) => {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid admin session");
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(unsigned)
    .digest("base64url");
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid admin session");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Admin session expired");
  }
  return payload;
};

export const parseCookies = (header = "") =>
  String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index > 0) cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});

export const buildAdminCookie = (token, { clear = false } = {}) => {
  const maxAge = clear ? 0 : getAdminSessionTtlSeconds();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${getAdminCookieName()}=${clear ? "" : encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    secure,
  ]
    .filter(Boolean)
    .join("; ");
};
