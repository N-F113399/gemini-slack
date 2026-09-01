import logger from "../utils/logger.js";
import { getLatestReplies } from "./messageStore.js";
import { getSummary, saveSummary } from "./conversationSummaryStore.js";
import { generate } from "./gemini/geminiService.js";
import { buildPrompt } from "./gemini/promptBuilder.js";
import { buildSummaryPrompt } from "./conversationSummaryUtils.js";
import { sendSlackMessage } from "./slackService.js";

const ACTIONS = new Set(["detail", "concise", "summarize", "translate", "regenerate", "rewrite"]);

export function parseShortcutPayload(payload = {}) {
  const callbackId = payload.callback_id || payload.callbackId || "";
  const action = callbackId.replace(/^gemini_/, "").toLowerCase();

  return {
    action: ACTIONS.has(action) ? action : null,
    channelId: payload.channel?.id || payload.channel_id || null,
    messageTs: payload.message?.ts || payload.message_ts || null,
    threadTs: payload.message?.thread_ts || payload.thread_ts || payload.message?.ts || null,
    responseUrl: payload.response_url || null,
  };
}

async function summarizeThread({ channelId, threadTs }) {
  const messages = await getLatestReplies(channelId, threadTs, Number.MAX_SAFE_INTEGER);
  if (messages.length === 0) {
    return { ok: false, reason: "no_messages" };
  }

  const existingSummary = await getSummary(channelId, threadTs);
  const summarizedCount = existingSummary?.message_count || 0;
  const newMessages = messages.slice(summarizedCount);

  if (newMessages.length === 0 && existingSummary?.summary) {
    return { ok: true, summary: existingSummary.summary, unchanged: true };
  }

  const summaryPrompt = buildSummaryPrompt({
    previousSummary: existingSummary?.summary || null,
    messages: newMessages.length > 0 ? newMessages : messages,
  });
  const contents = buildPrompt({
    systemPrompt: process.env.SYSTEM_PROMPT || "",
    history: [],
    userMessage: summaryPrompt,
  });
  const result = await generate({ contents });
  const summary = (result.text || "").trim();

  if (!summary) return { ok: false, reason: "empty_response" };

  const saved = await saveSummary({
    channel_id: channelId,
    thread_ts: threadTs,
    summary,
    message_count: messages.length,
  });

  if (!saved) return { ok: false, reason: "summary_save_failed" };

  return { ok: true, summary, model: result.model, unchanged: false };
}

export async function handleSlackShortcut(payload) {
  const parsed = parseShortcutPayload(payload);
  logger.info(`Message shortcut received: ${parsed.action || "unknown"}`);

  if (!parsed.action) return { ...parsed, supported: false, reason: "unsupported_action" };
  if (!parsed.channelId || !parsed.messageTs) return { ...parsed, supported: false, reason: "missing_message_context" };

  if (parsed.action === "summarize") {
    const result = await summarizeThread({
      channelId: parsed.channelId,
      threadTs: parsed.threadTs,
    });

    if (!result.ok) return { ...parsed, supported: true, executed: false, ...result };

    const text = result.unchanged
      ? `Current conversation summary:\n${result.summary}`
      : `Conversation summary updated:\n${result.summary}`;
    const slackResponse = await sendSlackMessage(parsed.channelId, parsed.threadTs, text);

    if (!slackResponse?.ok) {
      return { ...parsed, supported: true, executed: false, reason: "slack_error" };
    }

    return { ...parsed, supported: true, executed: true, ...result };
  }

  return { ...parsed, supported: true };
}
