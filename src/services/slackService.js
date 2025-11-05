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

// 🧵 スレッド履歴を取得（返信のみ・最後のN件）
export async function fetchSlackThreadHistory(channel, thread_ts, limit = 10) {
  let allReplies = [];
  let cursor = null;
  const bodyBase = { channel, ts: thread_ts };

  try {
    while (allReplies.length < limit) {
      const bodyParams = new URLSearchParams({
        ...bodyBase,
        limit: "100", // 1リクエストで最大100件
      });
      if (cursor) bodyParams.append("cursor", cursor);

      // 🔍 送信リクエストの内容をログ出力
      logger.debug("🛰️ Sending Slack history request with body:", Object.fromEntries(bodyParams.entries()));

      const response = await fetch(`${SLACK_API_URL}/conversations.replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        },
        body: bodyParams,
      });

      const data = await response.json();

      // 🔍 レスポンス全体をデバッグ出力
      logger.debug("📩 Raw Slack API response:", JSON.stringify(data, null, 2));

      if (!data.ok) throw new Error(data.error);

      const replies = data.messages.slice(1); // 親メッセージ除外
      allReplies = [...allReplies, ...replies];

      logger.info(`✅ Retrieved ${replies.length} replies (total so far: ${allReplies.length})`);

      if (!data.has_more) break;
      cursor = data.response_metadata?.next_cursor;
      if (!cursor) break;
    }

    // ✅ 最後のN件だけを抽出
    const lastReplies = allReplies.slice(-limit);

    // 🔍 各メッセージを詳細出力
    lastReplies.forEach((msg, i) => {
      logger.debug(`💬 Message #${i + 1}: ${JSON.stringify(msg, null, 2)}`);
    });

    logger.info(`🎯 Collected ${lastReplies.length} latest replies from thread ${thread_ts}`);
    return lastReplies;
  } catch (error) {
    logger.error(`❌ Failed to fetch thread history: ${error.message}`);
    return [];
  }
}

