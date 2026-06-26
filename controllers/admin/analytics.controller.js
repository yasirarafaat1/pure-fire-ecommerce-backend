import { getAnalyticsSummary } from "../../services/admin/analytics.service.js";

export const getAnalyticsSummaryController = async (req, res) => {
  const data = await getAnalyticsSummary({ range: req.query.range });
  return res.json({ status: true, data });
};
