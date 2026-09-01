import logger from "../utils/logger.js";
import { getLatestReplies, saveMessage } from "./messageStore.js";
import { summarizeThread } from "./conversationSummaryService.js";
import { generate } from "./gemini/geminiService.js";
import { sendSlackMessage } from "./slackService.js";
import { parseShortcutPayload } from "./slackShortcutParser.js";

function buildInstruction(action, targetText) {
  switch (action) {
    case "detail":
      return `Expand the following Gemini response with more detail, context, and explanation. Preserve the original meaning and do not mention this instruction.\n\nResponse:\n${targetText}`;
    case "concise":
      return `Rewrite the following Gemini response to be shorter and more concise. Preserve all important information and do not mention this instruction.\n\nResponse:\n${targetText}`;
    case "translate":
      return `Translate the following Gemini response into Japanese. Use natural Japanese appropriate to the context. Preserve the meaning, technical terms, formatting, and code blocks. Do not translate code, identifiers, or URLs. Do not add commentary or mention this instruction.\n\nResponse:\n${targetText}`;
    case "translate_en":
      return `Translate the following Gemini response into natural, fluent English. Prioritize idiomatic English expressions over a literal word-for-word translation while preserving the original meaning, nuance, intent, and level of formality. Preserve technical terms, formatting, and code blocks where appropriate. Do not translate code, identifiers, or URLs. Do not add commentary or mention this instruction.\n\nResponse:\n${targetText}`;
    case "regenerate":
      return `Regenerate the following Gemini response from scratch. Answer the same underlying question with a fresh approach. Preserve the original response's tone, personality, politeness, language, formatting conventions, and level of technical detail. Do not mention this instruction.\n\nPrevious response:\n${targetText}`;
    case "rewrite":
      return `Rewrite the following Gemini response to improve its wording, structure, and readability while preserving its original meaning, facts, intent, language, tone, and level of detail. Do not add new information or omit important information. Preserve code blocks, identifiers, URLs, technical notation, and formatting where appropriate. Do not mention this instruction.\n\nResponse:\n${targetText}`;
    default:
      return null;
  }
}

async function executeResponseTransformation({ action, channelId, threadTs, messageTs }) {
  logger.info(`Shortcut ${action}: loading messages channel=${channelId} thread=${threadTs}`);
  const messages = await getLatestReplies(channelId, threadTs, 50);
  logger.info(`Shortcut ${action}: loaded ${messages.length} messages`);

  const target = messages.find(message => message.message_ts === messageTs);
  if (!target) return { executed: false, reason: "message_not_found" };
  if (target.role !== "bot") return { executed: false, reason: "not_bot_message" };

  const instruction = buildInstruction(action, target.text);
  if (!instruction) return { executed: false, reason: "not_implemented" };

  logger.info(`Shortcut ${action}: generating transformed response`);
  const result = await generate({
    systemPrompt: process.env.SYSTEM_PROMPT || "",
    contents: [{ role: "user", parts: [{ text: instruction }] }],
  });

  const cleanReply = result.text || "（応答がありませんでした）";
  const displayReply = `${cleanReply}\n\n---\n使用モデル: ${result.model}`;
  const sent = await sendSlackMessage(channelId, threadTs, displayReply);
  if (!sent?.ok) return { executed: false, reason: "slack_send_failed" };

  const botTs = sent.ts || sent.message?.ts || String(Date.now() / 1000);
  await saveMessage({
    channel_id: channelId,
    thread_ts: threadTs,
    message_ts: botTs,
    user_id: null,
    role: "bot",
    text: cleanReply,
  });

  logger.info(`Shortcut ${action}: completed (message_ts=${botTs})`);
  return { executed: true, result, slackMessage: sent };
}

async function executeSummarize({ channelId, threadTs }) {
  logger.info(`Shortcut summarize: updating summary channel=${channelId} thread=${threadTs}`);
  const result = await summarizeThread({ channel_id: channelId, thread_ts: threadTs });
  if (!result) return { executed: false, reason: "summary_failed" };

  const label = result.reused ? "Current conversation summary" : "Conversation summary";
  const displayReply = `${label}\n\n${result.summary}\n\n---\n使用モデル: ${result.result?.model || "保存済みSummary"}`;
  const sent = await sendSlackMessage(channelId, threadTs, displayReply);
  if (!sent?.ok) return { executed: false, reason: "slack_send_failed" };

  logger.info(`Shortcut summarize: completed (message_count=${result.messageCount})`);
  return { executed: true, result, slackMessage: sent };
}

export async function handleSlackShortcut(payload) {
  const parsed = parseShortcutPayload(payload);
  logger.info(`Message shortcut received: ${parsed.action || "unknown"} (callback_id=${parsed.callbackId || "none"})`);

  if (!parsed.action) return { ...parsed, supported: false, reason: "unsupported_action" };
  if (!parsed.channelId || !parsed.messageTs) return { ...parsed, supported: false, reason: "missing_message_context" };

  if (parsed.action === "summarize") {
    const result = await executeSummarize(parsed);
    return { ...parsed, supported: true, ...result };
  }

  if (["detail", "concise", "translate", "translate_en", "regenerate", "rewrite"].includes(parsed.action)) {
    const result = await executeResponseTransformation(parsed);
    return { ...parsed, supported: true, ...result };
  }

  return { ...parsed, supported: true, executed: false, reason: "not_implemented" };
}

export { parseShortcutPayload };
