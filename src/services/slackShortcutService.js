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
  const messages = await getLatestReplies(channelId, threadTs, 50);
  const target = messages.find(message => message.message_ts === messageTs);

  if (!target) return { executed: false, reason: "message_not_found" };
  if (target.role !== "assistant") return { executed: false, reason: "not_bot_message" };

  const instruction = buildInstruction(action, target.text);
  if (!instruction) return { executed: false, reason: "not_implemented" };

  const result = await generate({
    contents: [{ role: "user", parts: [{ text: instruction }] }],
  });

  const sent = await sendSlackMessage(channelId, threadTs, result.text);
  if (!sent?.ok) return { executed: false, reason: "slack_send_failed" };

  await saveMessage({
    channel_id: channelId,
    thread_ts: threadTs,
    message_ts: sent.ts,
    user_id: null,
    role: "assistant",
    text: result.text,
  });

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
