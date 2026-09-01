// slackEvent.js
import express from "express";
import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { handleAppMention } from "../services/geminiService.js";

const router = express.Router();

let OWN_BOT_ID = process.env.SLACK_BOT_ID || null;
let fetchingOwnBotId = null;

async function resolveOwnBotId() {
  if (OWN_BOT_ID) return OWN_BOT_ID;
  if (fetchingOwnBotId) return fetchingOwnBotId;

  fetchingOwnBotId = (async () => {
    try {
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const body = await res.json();

      if (body.ok) {
        OWN_BOT_ID = body.bot_id || body.user_id || null;
        logger.info("Resolved OWN_BOT_ID: " + OWN_BOT_ID);
      } else {
        logger.warn("auth.test failed: " + JSON.stringify(body));
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

function getEventKey(event) {
  if (event?.event_id) return event.event_id;
  if (event?.channel && event?.ts) return `${event.channel}:${event.ts}`;
  return event?.event_ts || event?.ts || null;
}

function hasOwnBotMention(event, botId) {
  if (!botId || typeof event?.text !== "string") return false;
  const mentionPattern = new RegExp(`<@${botId}(?:\\|[^>]+)?>`);
  return mentionPattern.test(event.text);
}

router.post("/", async (req, res) => {
  const { type, challenge, event } = req.body || {};

  if (type === "url_verification") {
    return res.status(200).send({ challenge });
  }

  // ACK Slack immediately; processing happens asynchronously.
  res.sendStatus(200);

  if (!event) return;

  const eventKey = getEventKey(event);
  if (eventKey && processedEvents.has(eventKey)) return;
  if (eventKey) processedEvents.add(eventKey);

  // Ignore this bot's own messages to prevent response loops.
  const ownId = await resolveOwnBotId();
  if (event.bot_id && ownId && event.bot_id === ownId) {
    logger.debug("Ignoring own bot event (prevent loop). bot_id=" + event.bot_id);
    return;
  }

  if (event.subtype === "message_changed") return;

  const isAppMention = event.type === "app_mention";
  const isMessageMention = event.type === "message" && hasOwnBotMention(event, ownId);

  if (!isAppMention && !isMessageMention) return;

  logger.info(
    `Handling ${isAppMention ? "app_mention" : "message mention"} from ${event.user || event.bot_id}`,
  );
  logger.debug("Event payload: " + JSON.stringify(event));

  try {
    await handleAppMention(event);
  } catch (err) {
    logger.error("Error handling mention: " + err.message);
  }
});

export default router;
