import express from "express";
import logger from "../utils/logger.js";
import { handleSlackCommand } from "../services/slackCommandService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const result = await handleSlackCommand(req.body || {});

    if (!result.supported) {
      return res.status(200).send("対応していないコマンドです。/gemini 詳しく のように指定してください。");
    }

    return res.status(200).send(`「${result.command}」を受け付けました。`);
  } catch (err) {
    logger.error(`Slash command handling failed: ${err.message}`);
    return res.status(200).send("コマンド処理中にエラーが発生しました。");
  }
});

export default router;
