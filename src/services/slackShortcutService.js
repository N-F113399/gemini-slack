import logger from "../utils/logger.js";
import { getLatestReplies, saveMessage } from "./messageStore.js";
import { generate } from "./gemini/geminiService.js";
import { sendSlackMessage } from "./slackService.js";

const ACTIONS = new Set(["detail", "concise", "translate", "regenerate", "rewrite", "summarize"]);

function decodePayload(payload) {
  if (typeof payload === "object" && payload !== null) return payload;
  if (typeof payload !== "string") return {};
  try { return JSON.parse(payload); } catch { return {}; }
}

export function parseShortcutPayload(rawPayload = {}) {
  const payload = decodePayload(rawPayload);
  const callbackId = payload.callback_id || payload.callbackId || "";
  const action = callbackId.replace(/^gemini[_-]/i, "").toLowerCase();
  return {
    action: ACTIONS.has(action) ? action : null,
    callbackId,
    channelId: payload.channel?.id || payload.channel_id || null,
    messageTs: payload.message?.ts || payload.message_ts || null,
    threadTs: payload.message?.thread_ts || payload.thread_ts || payload.message?.ts || null,
    responseUrl: payload.response_url || null,
    payload,
  };
}

function buildInstruction(action, targetText) {
  if (action === "detail") {
    return `Expand the following Gemini response with more detail, context, and explanation. Preserve the original meaning and do not mention this instruction.\n\nResponse:\n${targetText}`;
  }
  if (action === "concise") {
    return `Rewrite the following Gemini response to be shorter and more concise. Preserve all important information and do not mention this instruction.\n\nResponse:\n${targetText}`;
  }
  return null;
}

async function executeResponseTransformation({ action, channelId, threadTs, messageTs }) {
  logger.info(`Shortcut ${action}: loading messages channel=${channelId} thread=${threadTs}`);
  const messages = await getLatestReplies(channelId, threadTs, 50);
  logger.info(`Shortcut ${action}: loaded ${messages.length} messages`);

  const target = messages.find(message => message.message_ts === messageTs);
  if (!target) {
    logger.warn(`Shortcut ${action}: target message not found ts=${messageTs}`);
    return { executed: false, reason: "message_not_found" };
  }

  // conversationService stores Gemini responses with role="bot".
  if (target.role !== "bot") {
    logger.warn(`Shortcut ${action}: target message is not a Gemini response (role=${target.role})`);
    return { executed: false, reason: "not_bot_message" };
  }

  const instruction = buildInstruction(action, target.text);
  if (!instruction) return { executed: false, reason: "not_implemented" };

  logger.info(`Shortcut ${action}: generating transformed response`);
  const result = await generate({
    contents: [{ role: "user", parts: [{ text: instruction }] }],
  });

  const sent = await sendSlackMessage(channelId, threadTs, result.text);
  if (!sent?.ok) {
    logger.error(`Shortcut ${action}: Slack post failed: ${sent?.error || "unknown error"}`);
    return { executed: false, reason: "slack_send_failed" };
  }

  const botTs = sent.ts || sent.message?.ts;
  if (botTs) {
    await saveMessage({
      channel_id: channelId,
      thread_ts: threadTs,
      message_ts: botTs,
      user_id: null,
      role: "bot",
      text: result.text,
    });
  }

  logger.info(`Shortcut ${action}: completed (message_ts=${botTs || "unknown"})`);
  return { executed: true, result, slackMessage: sent };
}

export async function handleSlackShortcut(payload) {
  const parsed = parseShortcutPayload(payload);
  logger.info(`Message shortcut received: ${parsed.action || "unknown"} (callback_id=${parsed.callbackId || "none"})`);

  if (!parsed.action) return { ...parsed, supported: false, reason: "unsupported_action" };
  if (!parsed.channelId || !parsed.messageTs) return { ...parsed, supported: false, reason: "missing_message_context" };

  if (parsed.action === "detail" || parsed.action === "concise") {
    const result = await executeResponseTransformation(parsed);
    return { ...parsed, supported: true, ...result };
  }

  return { ...parsed, supported: true, executed: false, reason: "not_implemented" };
}
