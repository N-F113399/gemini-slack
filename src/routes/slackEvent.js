// slackEvent.js
import express from "express";
import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { handleAppMention } from "../services/conversationService.js";
import { rateLimiter, RateLimitError } from "../services/rateLimitService.js";

const router = express.Router();

let OWN_BOT_USER_ID = process.env.SLACK_BOT_USER_ID || null;
let OWN_BOT_ID = process.env.SLACK_BOT_ID || null;
let resolvingBotIdentity = null;

const PROCESSED_EVENT_TTL_MS = 10 * 60 * 1000;
const MAX_PROCESSED_EVENTS = 10_000;
const processedEvents = new Map();

async function resolveBotIdentity() {
  if (OWN_BOT_USER_ID && OWN_BOT_ID) return { userId: OWN_BOT_USER_ID, botId: OWN_BOT_ID };
  if (resolvingBotIdentity) return resolvingBotIdentity;

  resolvingBotIdentity = (async () => {
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
        OWN_BOT_USER_ID = OWN_BOT_USER_ID || body.user_id || null;
        OWN_BOT_ID = OWN_BOT_ID || body.bot_id || null;
        logger.info(`Resolved bot identity: user_id=${OWN_BOT_USER_ID} bot_id=${OWN_BOT_ID}`);
      } else {
        logger.warn(`auth.test failed: ${body.error || "unknown error"}`);
      }
    } catch (err) {
      logger.error("Failed to call auth.test: " + err.message);
    } finally {
      resolvingBotIdentity = null;
    }

    return { userId: OWN_BOT_USER_ID, botId: OWN_BOT_ID };
  })();

  return resolvingBotIdentity;
}

function getEventKey(event) {
  if (event?.event_id) return event.event_id;
  if (event?.channel && event?.ts) return `${event.channel}:${event.ts}`;
  return event?.event_ts || event?.ts || null;
}

function hasOwnBotMention(event, botUserId) {
  if (!botUserId || typeof event?.text !== "string") return false;
  return new RegExp(`<@${botUserId}(?:\\|[^>]+)?>`).test(event.text);
}

function isDuplicateEvent(eventKey, now = Date.now()) {
  if (!eventKey) return false;

  const processedAt = processedEvents.get(eventKey);
  if (processedAt === undefined) return false;

  if (now - processedAt >= PROCESSED_EVENT_TTL_MS) {
    processedEvents.delete(eventKey);
    return false;
  }

  return true;
}

function rememberProcessedEvent(eventKey, now = Date.now()) {
  if (!eventKey) return;

  processedEvents.set(eventKey, now);

  if (processedEvents.size <= MAX_PROCESSED_EVENTS) return;

  const oldestKey = processedEvents.keys().next().value;
  if (oldestKey !== undefined) processedEvents.delete(oldestKey);
}

function forgetProcessedEvent(eventKey) {
  if (eventKey) processedEvents.delete(eventKey);
}

router.post("/", async (req, res) => {
  const { type, challenge, event } = req.body || {};

  if (type === "url_verification") {
    return res.status(200).send({ challenge });
  }

  res.sendStatus(200);

  if (!event) return;

  const eventKey = getEventKey(event);
  if (isDuplicateEvent(eventKey)) return;

  const { userId: ownBotUserId, botId: ownBotId } = await resolveBotIdentity();

  if (
    (event.bot_id && ownBotId && event.bot_id === ownBotId) ||
    (event.user && ownBotUserId && event.user === ownBotUserId)
  ) {
    logger.debug(
      `Ignoring own bot event (user_id=${event.user || "none"} bot_id=${event.bot_id || "none"})`,
    );
    return;
  }

  if (event.subtype === "message_changed") return;

  const isAppMention = event.type === "app_mention";
  const isMessageMention = event.type === "message" && hasOwnBotMention(event, ownBotUserId);

  if (!isAppMention && !isMessageMention) return;

  const rateLimitKey = event.user || event.channel || "unknown";
  try {
    const result = rateLimiter.check(rateLimitKey);
    logger.debug(`Rate limit accepted: key=${rateLimitKey} remaining=${result.remaining}`);
  } catch (err) {
    if (err instanceof RateLimitError) {
      const retryAfterSeconds = Math.max(1, Math.ceil(err.retryAfterMs / 1000));
      logger.warn(`Rate limit exceeded: key=${rateLimitKey} retryAfter=${retryAfterSeconds}s`);
      try {
        await import("../services/slackService.js").then(({ sendSlackMessage }) =>
          sendSlackMessage(
            event.channel,
            event.thread_ts || event.ts,
            `リクエストが多すぎます。${retryAfterSeconds}秒ほど待ってから再度お試しください。`,
          )
        );
      } catch (sendError) {
        logger.error(`Failed to send rate limit guidance: ${sendError.message}`);
      }
      return;
    }
    throw err;
  }

  if (isDuplicateEvent(eventKey)) return;
  rememberProcessedEvent(eventKey);

  logger.info(
    `Handling ${isAppMention ? "app_mention" : "message mention"} from ${event.user || event.bot_id}`,
  );
  logger.debug(`Event accepted: type=${event.type || "unknown"} user=${event.user || "none"} channel=${event.channel || "none"}`);

  try {
    await handleAppMention(event);
  } catch (err) {
    forgetProcessedEvent(eventKey);
    logger.error("Error handling mention: " + err.message);
  }
});

export default router;
