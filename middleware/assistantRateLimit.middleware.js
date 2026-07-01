const buckets = new Map();

const hourMs = 60 * 60 * 1000;

const getLimit = (req) => {
  if (req.assistantAuth?.email) {
    return Number(process.env.ASSISTANT_RATE_LIMIT_USER_PER_HOUR || 60);
  }
  return Number(process.env.ASSISTANT_RATE_LIMIT_GUEST_PER_HOUR || 20);
};

const getIdentity = (req) =>
  req.assistantAuth?.email ||
  req.body?.guestId ||
  req.query?.guestId ||
  req.ip ||
  "anonymous";

export const assistantRateLimit = (req, res, next) => {
  const key = String(getIdentity(req)).slice(0, 160);
  const now = Date.now();
  const limit = getLimit(req);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + hourMs });
    return next();
  }

  if (bucket.count >= limit) {
    return res.status(429).json({
      status: false,
      message: "Assistant limit reached. Please try again later.",
    });
  }

  bucket.count += 1;
  return next();
};
