export const parsePagination = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const paginationPayload = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: total ? Math.ceil(total / limit) : 0,
});

export const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const dateRangeFilter = (query) => {
  const createdAt = {};
  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime())) createdAt.$gte = from;
  }
  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime())) createdAt.$lte = to;
  }
  return Object.keys(createdAt).length ? { createdAt } : {};
};
