import express from "express";
import crypto from "node:crypto";
import { getFreeQuotaReport } from "../services/usage/freeQuotaReportService.js";

const router = express.Router();

function isAuthorized(req) {
  const expected = process.env.USAGE_REPORT_TOKEN;
  const actual = req.headers.authorization || "";
  if (!expected) return false;

  const expectedBuffer = Buffer.from(`Bearer ${expected}`, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

router.get("/", async (req, res) => {
  if (!isAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    return res.status(200).json(await getFreeQuotaReport());
  } catch (error) {
    return res.status(500).json({ error: "Failed to build free quota report" });
  }
});

export default router;
