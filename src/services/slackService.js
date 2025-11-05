import fetch from "node-fetch";
import logger from "../utils/logger.js";

const SLACK_API_URL = "https://slack.com/api";

export async function sendSlackMessage(channel, thread_ts, text) {
  const response = await fetch(`${SLACK_API_URL}/chat.postMessage`, {
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
  });

  const data = await response.json();
  if (!data.ok) {
    logger.error(`Slack API error: ${data.error}`);
  }
  return data;
}

// 🆕 履歴取得関数（詳細ログ付き）
export async function fetchSlackThreadHistory(channel, thread_ts, limit = 10) {
  const bodyParams = new URLSearchParams({
    channel,
    ts: thread_ts,
    limit: limit.toString(),
  });

  // リクエスト前に送信内容をログ出力
  logger.debug("🛰️ Sending Slack history request with body:", Object.fromEntries(bodyParams.entries()));

  try {
    const response = await fetch(`${SLACK_API_URL}/conversations.replies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: bodyParams,
    });

    const data = await response.json();

    // レスポンスの全体をデバッグ出力
    logger.debug("📩 Raw Slack API response:", JSON.stringify(data, null, 2));

    if (!data.ok) throw new Error(data.error);

    logger.info(`✅ Fetched ${data.messages.length} messages from thread ${thread_ts}`);
    // 各メッセージを詳細に出力
    data.messages.forEach((msg, i) => {
      logger.debug(`Message #${i + 1}: ${JSON.stringify(msg, null, 2)}`);
    });

    return data.messages;
  } catch (error) {
    logger.error(`❌ Failed to fetch thread history: ${error.message}`);
    return [];
  }
}
