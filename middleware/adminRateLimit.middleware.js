const buckets = new Map();

const limiter = ({ windowMs, max, keyPrefix }) => (req, res, next) => {
  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();
  const key = `${keyPrefix}:${ip}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  current.count += 1;
  if (current.count > max) {
    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
    return res.status(429).json({ status: false, message: "Too many requests" });
  }
  next();
};

export const adminLoginRateLimit = limiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: "admin-login",
});

export const adminApiRateLimit = limiter({
  windowMs: 60 * 1000,
  max: 240,
  keyPrefix: "admin-api",
});
