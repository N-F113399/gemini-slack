import express from "express";
import logger from "../utils/logger.js";
import { handleSlackCommand } from "../services/slackCommandService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const result = await handleSlackCommand(req.body || {});

    if (!result.supported) {
      return res.status(200).send("Unsupported command. Use /gemini summarize for conversation-level actions.");
    }

    if (result.executed) {
      return res.status(200).send("");
    }

    if (result.reason === "thread_required") {
      return res.status(200).send("Run this command from inside a thread.");
    }

    if (result.reason === "no_bot_message") {
      return res.status(200).send("No previous Gemini answer was found in this thread.");
    }

    return res.status(200).send(`/${result.command} is recognized, but this command is not implemented yet.`);
  } catch (err) {
    logger.error(`Slash command handling failed: ${err.message}`);
    return res.status(200).send("Command processing failed. Please try again later.");
  }
});

export default router;
