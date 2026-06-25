// src/services/geminiService.js
import fetch from "node-fetch";
import logger from "../utils/logger.js";
import { getLatestReplies, saveMessage } from "./messageStore.js";
import { sendSlackMessage } from "./slackService.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_RETRY_LIMIT = 5;
const BASE_BACKOFF_MS = 300;
const MAX_BACKOFF_MS = 4000;

function getRetryModelNames() {
  const rawModels = process.env.GEMINI_RETRY_MODELS || "";
  const parsed = rawModels
    .split(",")
    .map(model => model.trim())
    .filter(Boolean);
  return parsed;
}

/**
 * Decide whether an error response/exception is worth retrying
 * (rate limit, quota exhaustion, or transient server-side capacity issues
 * like the "high demand" 503 UNAVAILABLE error).
 */
function isRetryableError(res, data) {
  if (res && (res.status === 429 || res.status === 503 || res.status === 504)) {
    return true;
  }
  const status = data?.error?.status;
  if (status === "RESOURCE_EXHAUSTED" || status === "UNAVAILABLE") {
    return true;
  }
  const message = (data?.error?.message || "").toLowerCase();
  return (
    message.includes("quota") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("unavailable")
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelay(attemptIndex) {
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attemptIndex - 1, 0), MAX_BACKOFF_MS);
  const jitter = Math.random() * 200;
  return exp + jitter;
}

async function fetchGeminiResponse({ contents, modelName, timeoutMs }) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  // Don't let a malformed/empty body turn into an uncaught exception that
  // skips the rest of the fallback chain — treat it as a normal error response.
  let data;
  try {
    data = await res.json();
  } catch (_) {
    data = { error: { message: `Non-JSON response (status ${res.status})`, status: String(res.status) } };
  }

  return { res, data };
}

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

  const filteredReplies = replies.filter(reply => reply.message_ts !== event.ts);
  if (filteredReplies.length !== replies.length) {
    logger.info("🧹 Removed current user message from context to avoid duplication.");
  }

  // 3) Build Gemini contents (system prompt + history + last user message)
  const systemPrompt = process.env.SYSTEM_PROMPT || "";
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const retryModelNames = getRetryModelNames();

  const historyParts = filteredReplies.map(r => {
    const who = r.role === "user" ? "User" : "Bot";
    return { parts: [{ text: `${who}: ${r.text}` }] };
  });

  const contents = [
    { parts: [{ text: systemPrompt }] },
    ...historyParts,
    { parts: [{ text: `User: ${userMessage}` }] },
  ];

  logger.debug("🔧 Gemini request contents:", JSON.stringify(contents, null, 2));

  // 4) Call Gemini with timeout, retrying across fallback models on transient errors
  const timeoutMsEnv = Number(process.env.GEMINI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutMsEnv) && timeoutMsEnv > 0
    ? timeoutMsEnv
    : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMsEnv) || timeoutMsEnv <= 0) {
    logger.info(`timeoutMs is invalid; defaulting to ${timeoutMs}`);
  }

  const retryLimitEnv = Number(process.env.GEMINI_RETRY_LIMIT);
  const retryLimit = Number.isFinite(retryLimitEnv) && retryLimitEnv > 0
    ? retryLimitEnv
    : DEFAULT_RETRY_LIMIT;
  const retryModels = retryModelNames.slice(0, retryLimit);
  const modelCandidates = [modelName, ...retryModels];

  let responseModel = modelName;
  let replyText = null;
  let lastErrorMsg = null;
  let failed = false;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const currentModel = modelCandidates[index];
    responseModel = currentModel;

    if (index > 0) {
      const delay = backoffDelay(index);
      logger.info(`⏳ Backing off ${Math.round(delay)}ms before retry`);
      await sleep(delay);
    }

    logger.info(`🔁 Gemini request attempt ${index + 1}/${modelCandidates.length} with model=${currentModel}`);

    let res, data;
    try {
      ({ res, data } = await fetchGeminiResponse({ contents, modelName: currentModel, timeoutMs }));
    } catch (err) {
      // Network error, abort/timeout, etc. — still try the next model if any remain.
      lastErrorMsg = err.message;
      const isTimeout = err.name === "AbortError";
      logger.warn(
        `Gemini request threw on model=${currentModel} (${isTimeout ? "timeout" : err.name}): ${err.message}`
      );
      if (index === modelCandidates.length - 1) {
        failed = true;
        break;
      }
      continue;
    }

    logger.debug("📩 Gemini raw response:", JSON.stringify(data, null, 2));

    if (res.ok) {
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleanedText = candidateText
        ? candidateText.replace(/\n\n---\n使用モデル:.*$/s, "").trim()
        : "";
      replyText = cleanedText || "（応答がありませんでした）";
      break;
    }

    lastErrorMsg = data?.error?.message || JSON.stringify(data ?? {});

    if (!isRetryableError(res, data) || index === modelCandidates.length - 1) {
      failed = true;
      break;
    }

    logger.warn(`Gemini error (status=${res.status}) on model=${currentModel}: ${lastErrorMsg}. Retrying with next model.`);
  }

  if (failed) {
    logger.error(`Gemini API Error: ${lastErrorMsg}`);
    await sendSlackMessage(
      channelId,
      threadTs,
      "Gemini でエラーが発生しました。少し時間をおいて再度お試しください。"
    );
    return;
  }

  const cleanReply = replyText || "（応答がありませんでした）";
  const displayReply = `${cleanReply}\n\n---\n使用モデル: ${responseModel}`;
  logger.info("💬 Gemini reply retrieved");
  logger.info(`💬 Gemini reply model: ${responseModel}`);
  logger.debug("💬 reply text:", displayReply);

  // 5) Post to Slack and save bot message into DB (without the footer, so it
  //    doesn't leak into future prompt history / get echoed back by the model)
  try {
    const slackResp = await sendSlackMessage(channelId, threadTs, displayReply);

    if (slackResp && slackResp.ok) {
      const botTs = slackResp.ts || (slackResp.message && slackResp.message.ts) || String(Date.now() / 1000);
      await saveMessage({
        channel_id: channelId,
        thread_ts: threadTs || botTs,
        message_ts: botTs,
        user_id: null,
        role: "bot",
        text: cleanReply,
      });
      logger.debug(`💾 saved bot message to DB (ts=${botTs})`);
    } else {
      logger.error("Slack post returned not-ok when trying to send Gemini reply");
    }
  } catch (err) {
    logger.error("Failed to send or save bot message: " + err.message);
    try {
      await sendSlackMessage(channelId, threadTs, "返信の送信中にエラーが発生しました。");
    } catch (_) {}
  }
}
