import logger from "../utils/logger.js";
import { saveMessage } from "./messageStore.js";
import { buildContext } from "./contextService.js";
import { updateSummaryIfNeeded } from "./conversationSummaryService.js";
import { sendSlackMessage } from "./slackService.js";
import { generate } from "./gemini/geminiService.js";
import { buildPrompt } from "./gemini/promptBuilder.js";
import { resolveSlackFiles } from "./content/slackFileResolver.js";
import { processImageContent } from "./content/processors/imageProcessor.js";
import { processTextContent, isSupportedTextMimeType } from "./content/processors/textProcessor.js";
import { adaptContentsToGeminiParts } from "./content/adapters/geminiContentAdapter.js";
import { ContentError } from "./content/contentErrors.js";

const DEFAULT_HISTORY_LIMIT = 10;
const DEFAULT_MAX_USER_MESSAGE_LENGTH = 4000;

function getSupportedFiles(files = []) {
  return files.filter(file => {
    const mimeType = (file.mimetype || file.mime_type || "").toLowerCase();
    return mimeType.startsWith("image/") || isSupportedTextMimeType(mimeType);
  });
}

function getUnsupportedFiles(files = []) {
  return files.filter(file => !getSupportedFiles([file]).length);
}

function processResolvedContent(content) {
  const mimeType = (content.original?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return processImageContent(content);
  if (isSupportedTextMimeType(mimeType)) return processTextContent(content);
  throw new ContentError("UNSUPPORTED_MIME_TYPE", `Unsupported attachment MIME type: ${mimeType}`);
}

export async function handleAppMention(event) {
  const safeEvent = event || {};
  const userId = safeEvent.user;
  const channelId = safeEvent.channel;
  const threadTs = safeEvent.thread_ts || safeEvent.ts;
  const rawText = safeEvent.text || "";

  const missingFields = [];
  if (!userId) missingFields.push("user");
  if (!channelId) missingFields.push("channel");
  if (!safeEvent.text && (!safeEvent.files || safeEvent.files.length === 0)) missingFields.push("text");

  if (missingFields.length > 0) {
    const guidance = "メンションの形式が不正です。もう一度メッセージを送ってください。";
    logger.warn(`Missing required event fields: ${missingFields.join(", ")}`);
    if (channelId) {
      try { await sendSlackMessage(channelId, threadTs, guidance); } catch (err) {
        logger.error(`Failed to send missing-field guidance: ${err.message}`);
      }
    }
    return;
  }

  const userMessage = rawText.replace(/<@[^>]+>\s*/, "").trim();
  const maxUserMessageLengthEnv = Number(process.env.MAX_USER_MESSAGE_LENGTH);
  const maxUserMessageLength = Number.isFinite(maxUserMessageLengthEnv)
    ? maxUserMessageLengthEnv : DEFAULT_MAX_USER_MESSAGE_LENGTH;

  logger.info(`📣 app_mention from user=${userId} channel=${channelId} thread=${threadTs}`);
  logger.debug(`📥 Event body: ${JSON.stringify(event, null, 2)}`);
  logger.debug(`📝 Parsed userMessage: ${userMessage}`);

  if (!userMessage && (!safeEvent.files || safeEvent.files.length === 0)) {
    await sendSlackMessage(channelId, threadTs, "質問や添付ファイルを入力してください。");
    return;
  }

  if (userMessage.length > maxUserMessageLength) {
    await sendSlackMessage(channelId, threadTs, `メッセージが長すぎます。${maxUserMessageLength}文字以内で入力してください。`);
    return;
  }

  try {
    await saveMessage({
      channel_id: channelId,
      thread_ts: threadTs,
      message_ts: event.ts,
      user_id: userId,
      role: "user",
      text: userMessage || "[file attachment]",
    });
    logger.debug("💾 incoming message saved to DB");
  } catch (err) {
    logger.error("Failed to save incoming user message: " + err.message);
  }

  const historyLimitEnv = Number(process.env.HISTORY_MAX);
  const historyLimit = Number.isFinite(historyLimitEnv) && historyLimitEnv > 0 ? historyLimitEnv : DEFAULT_HISTORY_LIMIT;
  if (!Number.isFinite(historyLimitEnv) || historyLimitEnv <= 0) logger.info(`historyLimit is invalid; defaulting to ${historyLimit}`);

  let context = { summary: null, summaryMessageCount: 0, recentMessages: [] };
  try {
    context = await buildContext({
      channel_id: channelId,
      thread_ts: threadTs,
      current_message_ts: event.ts,
      recentLimit: historyLimit,
    });
    logger.info(`🔎 Retrieved context: summary=${Boolean(context.summary)} recentMessages=${context.recentMessages.length}`);
    logger.debug("🧾 Context messages:", JSON.stringify(context.recentMessages, null, 2));
  } catch (err) {
    logger.error("Failed to build conversation context: " + err.message);
  }

  let inputParts = [];
  const files = safeEvent.files || [];
  const supportedFiles = getSupportedFiles(files);
  const unsupportedFiles = getUnsupportedFiles(files);

  if (supportedFiles.length > 0) {
    try {
      const resolvedContents = await resolveSlackFiles(supportedFiles);
      const processedContents = resolvedContents.map(processResolvedContent);
      inputParts = adaptContentsToGeminiParts(processedContents);
      logger.info(`📎 Prepared ${processedContents.length} attachment(s) for Gemini`);
    } catch (err) {
      const message = err instanceof ContentError
        ? `添付ファイルを処理できませんでした: ${err.message}`
        : "添付ファイルの処理中にエラーが発生しました。";
      logger.error(`Failed to process attachments: ${err.message}`);
      await sendSlackMessage(channelId, threadTs, message);
      return;
    }
  }

  if (unsupportedFiles.length > 0) {
    logger.info(`Ignoring ${unsupportedFiles.length} unsupported attachment(s) until their processors are implemented`);
    if (supportedFiles.length === 0 && files.length > 0) {
      await sendSlackMessage(channelId, threadTs, "添付されたファイル形式には現在対応していません。");
      return;
    }
  }

  const systemPrompt = process.env.SYSTEM_PROMPT || "";
  const contents = buildPrompt({
    systemPrompt,
    history: context.recentMessages,
    summary: context.summary,
    userMessage: userMessage || "添付したファイルを確認してください。",
    inputParts,
  });

  let result;
  try {
    result = await generate({ contents });
  } catch (err) {
    logger.error(`Gemini API Error: ${err.message}`);
    await sendSlackMessage(channelId, threadTs, "Gemini でエラーが発生しました。少し時間をおいて再度お試しください。");
    return;
  }

  const cleanReply = result.text || "（応答がありませんでした）";
  const displayReply = `${cleanReply}\n\n---\n使用モデル: ${result.model}`;
  logger.info("💬 Gemini reply retrieved");
  logger.info(`💬 Gemini reply model: ${result.model}`);
  logger.debug("💬 reply text:", displayReply);

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
      updateSummaryIfNeeded({ channel_id: channelId, thread_ts: threadTs })
        .catch((err) => logger.error(`Detached summary update failed: ${err.message}`));
    } else {
      logger.error("Slack post returned not-ok when trying to send Gemini reply");
    }
  } catch (err) {
    logger.error("Failed to send or save bot message: " + err.message);
    try { await sendSlackMessage(channelId, threadTs, "返信の送信中にエラーが発生しました。"); } catch (_) {}
  }
}
