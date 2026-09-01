import logger from "../utils/logger.js";
import { getLatestReplies, saveMessage } from "./messageStore.js";
import { sendSlackMessage } from "./slackService.js";
import { generate } from "./gemini/geminiService.js";
import { buildPrompt } from "./gemini/promptBuilder.js";

const DEFAULT_HISTORY_LIMIT = 10;
const DEFAULT_MAX_USER_MESSAGE_LENGTH = 4000;

/**
 * Orchestrate one Slack conversation turn.
 * This service owns Slack/conversation flow, while Gemini-specific concerns
 * remain inside the gemini service.
 */
export async function handleAppMention(event) {
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
      `メッセージが長すぎます。${maxUserMessageLength}文字以内で入力してください。`,
    );
    return;
  }

  // Save incoming user message. Persistence failures are logged but do not
  // prevent the current request from reaching Gemini, preserving the old flow.
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
  }

  const filteredReplies = replies.filter(reply => reply.message_ts !== event.ts);
  if (filteredReplies.length !== replies.length) {
    logger.info("🧹 Removed current user message from context to avoid duplication.");
  }

  const systemPrompt = process.env.SYSTEM_PROMPT || "";
  const contents = buildPrompt({
    systemPrompt,
    history: filteredReplies,
    userMessage,
  });

  logger.debug("🔧 Gemini request contents:", JSON.stringify(contents, null, 2));

  let result;
  try {
    result = await generate({ contents });
  } catch (err) {
    logger.error(`Gemini API Error: ${err.message}`);
    await sendSlackMessage(
      channelId,
      threadTs,
      "Gemini でエラーが発生しました。少し時間をおいて再度お試しください。",
    );
    return;
  }

  const cleanReply = result.text || "（応答がありませんでした）";
  const displayReply = `${cleanReply}\n\n---\n使用モデル: ${result.model}`;
  logger.info("💬 Gemini reply retrieved");
  logger.info(`💬 Gemini reply model: ${result.model}`);
  logger.debug("💬 reply text:", displayReply);

  // Post to Slack and persist the bot message without the model footer.
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
