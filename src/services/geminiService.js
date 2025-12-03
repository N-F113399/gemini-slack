// src/services/geminiService.js
import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { getLatestReplies, saveMessage } from "./messageStore.js";
import { sendSlackMessage } from "./slackService.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";

/**
 * Handle an app_mention event: load context from DB, call Gemini, persist & reply.
 * @param {object} event Slack event object
 */
export async function handleAppMention(event) {
  const DEFAULT_HISTORY_LIMIT = 10;
  const DEFAULT_TIMEOUT_MS = 15000;
  const DEFAULT_MAX_USER_MESSAGE_LENGTH = 4000;

  const safeEvent = event || {};
  const userId = safeEvent.user;
  const channelId = safeEvent.channel;
  const threadTs = safeEvent.thread_ts || safeEvent.ts;
  const rawText = safeEvent.text || "";

  const missingFields = [];
  if (!userId) missingFields.push("user");
  if (!channelId) missingFields.push("channel");
  if (!safeEvent.text) missingFields.push("text");

  if (missingFields.length > 0) {
    const guidance = "メンションの形式が不正です。もう一度メッセージを送ってください。";
    logger.warn(`Missing required event fields: ${missingFields.join(", ")}`);
    if (channelId) {
      try {
        await sendSlackMessage(channelId, threadTs, guidance);
      } catch (err) {
        logger.error(`Failed to send missing-field guidance: ${err.message}`);
      }
    }
    return;
  }

  const userMessage = rawText.replace(/<@[^>]+>\s*/, "").trim();
  const maxUserMessageLengthEnv = Number(process.env.MAX_USER_MESSAGE_LENGTH);
  const maxUserMessageLength = Number.isFinite(maxUserMessageLengthEnv)
    ? maxUserMessageLengthEnv
    : DEFAULT_MAX_USER_MESSAGE_LENGTH;

  logger.info(`📣 app_mention from user=${userId} channel=${channelId} thread=${threadTs}`);
  logger.debug(`📥 Event body: ${JSON.stringify(event, null, 2)}`);
  logger.debug(`📝 Parsed userMessage: ${userMessage}`);

  if (!userMessage) {
    await sendSlackMessage(channelId, threadTs, "メッセージ内容が空です。質問や内容を入力してください。");
    return;
  }

  if (userMessage.length > maxUserMessageLength) {
    await sendSlackMessage(
      channelId,
      threadTs,
      `メッセージが長すぎます。${maxUserMessageLength}文字以内で入力してください。`
    );
    return;
  }

  // 1) Save incoming user message to DB (encrypted inside saveMessage)
  try {
    await saveMessage({
      channel_id: channelId,
      thread_ts: threadTs,
      message_ts: event.ts,
      user_id: userId,
      role: "user",
      text: userMessage,
    });
    logger.debug("💾 incoming message saved to DB");
  } catch (err) {
    logger.error("Failed to save incoming user message: " + err.message);
  }

  // 2) Load latest context from DB (返信のみの最新 N 件; returns oldest->newest)
  const historyLimitEnv = Number(process.env.HISTORY_MAX);
  const historyLimit = Number.isFinite(historyLimitEnv) && historyLimitEnv > 0
    ? historyLimitEnv
    : DEFAULT_HISTORY_LIMIT;
  if (!Number.isFinite(historyLimitEnv) || historyLimitEnv <= 0) {
    logger.info(`historyLimit is invalid; defaulting to ${historyLimit}`);
  }
  let replies = [];
  try {
    replies = await getLatestReplies(channelId, threadTs, historyLimit);
    logger.info(`🔎 Retrieved ${replies.length} context messages from DB`);
    logger.debug("🧾 Context messages:", JSON.stringify(replies, null, 2));
  } catch (err) {
    logger.error("Failed to load replies from DB: " + err.message);
    replies = [];
  }

  // 3) Build Gemini contents (system prompt + history + last user message)
  const systemPrompt = process.env.SYSTEM_PROMPT || "";
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const historyParts = replies.map(r => {
    const who = r.role === "user" ? "User" : "Bot";
    return { parts: [{ text: `${who}: ${r.text}` }] };
  });

  const contents = [
    { parts: [{ text: systemPrompt }] },
    ...historyParts,
    { parts: [{ text: `User: ${userMessage}` }] },
  ];

  logger.debug("🔧 Gemini request contents:", JSON.stringify(contents, null, 2));

  // 4) Call Gemini with timeout
  const timeoutMsEnv = Number(process.env.GEMINI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutMsEnv) && timeoutMsEnv > 0
    ? timeoutMsEnv
    : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMsEnv) || timeoutMsEnv <= 0) {
    logger.info(`timeoutMs is invalid; defaulting to ${timeoutMs}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await res.json();
    logger.debug("📩 Gemini raw response:", JSON.stringify(data, null, 2));

    if (!res.ok) {
      const errMsg = data.error?.message || JSON.stringify(data);
      logger.error(`Gemini API Error: ${errMsg}`);
      await sendSlackMessage(
        channelId,
        threadTs,
        "Gemini でエラーが発生しました。少し時間をおいて再度お試しください。"
      );
      return;
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "（応答がありませんでした）";
    logger.info("💬 Gemini reply retrieved");
    logger.debug("💬 reply text:", reply);

    // 5) Post to Slack and save bot message into DB
    try {
      const slackResp = await sendSlackMessage(channelId, threadTs, reply);

      if (slackResp && slackResp.ok) {
        const botTs = slackResp.ts || (slackResp.message && slackResp.message.ts) || String(Date.now() / 1000);
        await saveMessage({
          channel_id: channelId,
          thread_ts: threadTs || botTs,
          message_ts: botTs,
          user_id: null,
          role: "bot",
          text: reply,
        });
        logger.debug(`💾 saved bot message to DB (ts=${botTs})`);
      } else {
        logger.error("Slack post returned not-ok when trying to send Gemini reply");
      }
    } catch (err) {
      logger.error("Failed to send or save bot message: " + err.message);
      try { await sendSlackMessage(channelId, threadTs, "返信の送信中にエラーが発生しました。"); } catch (_) {}
    }
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      const timeoutMsg = `Gemini の応答がタイムアウトしました（${timeoutMs}ms）。`;
      logger.warn(timeoutMsg);
      await sendSlackMessage(channelId, threadTs, timeoutMsg);
    } else {
      logger.error("Error calling Gemini: " + error.message, error);
      await sendSlackMessage(
        channelId,
        threadTs,
        "Gemini でエラーが発生しました。少し時間をおいて再度お試しください。"
      );
    }
  }
}
