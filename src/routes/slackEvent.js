// slackEvent.js (抜粋／置き換え用)
import express from "express";
import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { handleAppMention } from "../services/geminiService.js";

const router = express.Router();

let OWN_BOT_ID = process.env.SLACK_BOT_ID || null;
let fetchingOwnBotId = null;

async function resolveOwnBotId() {
  if (OWN_BOT_ID) return OWN_BOT_ID;
  if (fetchingOwnBotId) return fetchingOwnBotId; // 同時呼び出し防止
  fetchingOwnBotId = (async () => {
    try {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const j = await res.json();
      if (j.ok) {
        // Slack の auth.test は workspace 内の bot_id を返す（場合により user_id）
        OWN_BOT_ID = j.bot_id || j.user_id || null;
        logger.info("Resolved OWN_BOT_ID: " + OWN_BOT_ID);
      } else {
        logger.warn("auth.test failed: " + JSON.stringify(j));
      }
    } catch (err) {
      logger.error("Failed to call auth.test: " + err.message);
    } finally {
      fetchingOwnBotId = null;
    }
    return OWN_BOT_ID;
  })();
  return fetchingOwnBotId;
}

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
  if (!event || processedEvents.has(event.event_ts || event.ts)) return;
  processedEvents.add(event.event_ts || event.ts);

  // Bot 自身のイベントは無視（他ボットは許可）
  const ownId = await resolveOwnBotId();
  if (event.bot_id && ownId && event.bot_id === ownId) {
    logger.debug(
      "Ignoring own bot event (prevent loop). bot_id=" + event.bot_id,
    );
    return;
  }

  // // 編集イベントは無視
  if (event.subtype && event.subtype === "message_changed") {
    return;
  }

  // handle mention only
  if (
    event.type ===
    "app_mention" /* or event.type === 'message' and check mention */
  ) {
    logger.info(`Handling app_mention from ${event.user || event.bot_id}`);
    logger.debug("Event payload: " + JSON.stringify(event));
    try {
      await handleAppMention(event);
    } catch (err) {
      logger.error("Error handling mention: " + err.message);
    }
  }
});

export default router;
