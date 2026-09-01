import express from "express";
import { getUsageReport } from "../services/usage/usageReportService.js";

const router = express.Router();

function isAuthorized(req) {
  const expected = process.env.USAGE_REPORT_TOKEN;
  if (!expected) return false;
  const authorization = req.headers.authorization || "";
  return authorization === `Bearer ${expected}`;
}

router.get("/", async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });

  try {
    const report = await getUsageReport({
      from: req.query.from || null,
      to: req.query.to || null,
    });
    return res.status(200).json(report);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to build usage report" });
  }
});

export default router;
