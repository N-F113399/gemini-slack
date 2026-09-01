import express from "express";
import { getFreeQuotaReport } from "../services/usage/freeQuotaReportService.js";

const router = express.Router();

function isAuthorized(req) {
  const expected = process.env.USAGE_REPORT_TOKEN;
  if (!expected) return false;
  return req.headers.authorization === `Bearer ${expected}`;
}

router.get("/", async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    return res.status(200).json(await getFreeQuotaReport());
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to build free quota report" });
  }
});

export default router;
