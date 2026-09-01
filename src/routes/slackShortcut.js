import express from "express";
import logger from "../utils/logger.js";
import { handleSlackShortcut } from "../services/slackShortcutService.js";

const router = express.Router();

router.post("/", express.urlencoded({ extended: false }), (req, res) => {
  const payload = req.body?.payload || req.body || {};

  // Acknowledge the Slack shortcut immediately. Gemini/DB processing can take
  // longer than Slack's acknowledgement window, so it must not block the ACK.
  res.status(200).send("");

  handleSlackShortcut(payload).catch((err) => {
    logger.error(`Message shortcut handling failed: ${err.stack || err.message}`);
  });
});

export default router;
