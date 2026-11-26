import fetch from "node-fetch";
import logger from "../utils/logger.js";

const SLACK_API_URL = "https://slack.com/api";
const DEFAULT_TIMEOUT_MS = 10_000;

function getTimeoutMs() {
  const value = Number(process.env.SLACK_API_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

export async function sendSlackMessage(channel, thread_ts, text, { fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeoutMs = getTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const payloadLength = typeof text === "string" ? text.length : 0;
  const payloadBytes = Buffer.byteLength(typeof text === "string" ? text : "", "utf8");

  logger.info(`Slack message send started: channel=${channel}, threadTs=${thread_ts || "none"}, textLength=${payloadLength}, textBytes=${payloadBytes}`);

  try {
    const response = await fetchImpl(`${SLACK_API_URL}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel,
        thread_ts,
        text,
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    const warnings = Array.isArray(data?.response_metadata?.warnings)
      ? data.response_metadata.warnings
      : [];

    if (!data.ok) {
      logger.error(`Slack API error: ${data.error} (channel=${channel}, textLength=${payloadLength}, textBytes=${payloadBytes})`);
    }
    if (warnings.length > 0) {
      logger.warn(`Slack API returned message warnings: ${JSON.stringify(warnings)} (channel=${channel}, threadTs=${thread_ts || "none"}, textLength=${payloadLength}, textBytes=${payloadBytes})`);
    }
    if (warnings.some(warning => String(warning).toLowerCase().includes("truncat"))) {
      logger.warn(`Slack may have truncated the message (channel=${channel}, threadTs=${thread_ts || "none"}, textLength=${payloadLength}, textBytes=${payloadBytes})`);
    }

    logger.info(`Slack message send completed: ok=${Boolean(data?.ok)}, channel=${channel}, threadTs=${thread_ts || "none"}, textLength=${payloadLength}, textBytes=${payloadBytes}`);
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Slack API request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
