import express from "express";
import { handleAppMention } from "../services/geminiService.js";

const router = express.Router();
const processedEvents = new Set();

router.post("/", async (req, res) => {
  const { type, challenge, event } = req.body;

  // URL確認
  if (type === "url_verification") {
    return res.status(200).send({ challenge });
  }

  // Slackへ即時レスポンス（遅延で再送されるのを防ぐ）
  res.sendStatus(200);

  // イベントなし or 再送防止
  if (!event || processedEvents.has(event.client_msg_id)) return;
  processedEvents.add(event.client_msg_id);

  // Botメッセージは無視
  if (event.bot_id) return;

  // 対応イベントタイプだけ処理
  if (event.type === "app_mention") {
    await handleAppMention(event);
  }
});

export default router;
