import express from "express";
import logger from "../utils/logger.js";
import { handleSlackShortcut } from "../services/slackShortcutService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const result = await handleSlackShortcut(req.body || {});

    if (!result.supported) {
      return res.status(200).json({ ok: false, reason: result.reason });
    }

    return res.status(200).json({ ok: true, action: result.action });
  } catch (err) {
    logger.error(`Message shortcut handling failed: ${err.message}`);
    return res.status(200).json({ ok: false, reason: "internal_error" });
  }
});

export default router;
