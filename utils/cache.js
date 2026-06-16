const store = new Map();

export const getCache = (key) => {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt && hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
};

export const setCache = (key, value, ttlMs = 0) => {
  const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
  store.set(key, { value, expiresAt });
  return value;
};
