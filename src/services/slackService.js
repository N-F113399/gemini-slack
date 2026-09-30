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
    if (!data.ok) {
      logger.error(`Slack API error: ${data.error}`);
    }
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
