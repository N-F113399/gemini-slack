import logger from "../utils/logger.js";
import { getLatestReplies } from "./messageStore.js";
import { getSummary, saveSummary } from "./conversationSummaryStore.js";
import { generate } from "./gemini/geminiService.js";
import { buildPrompt } from "./gemini/promptBuilder.js";
import {
  DEFAULT_TRIGGER_MESSAGES,
  DEFAULT_UPDATE_INTERVAL,
  getPositiveIntegerEnv,
  shouldUpdateSummary,
  buildSummaryPrompt,
} from "./conversationSummaryUtils.js";

async function generateAndSaveSummary({ channel_id, thread_ts, messages, previousSummary = null }) {
  const summaryPrompt = buildSummaryPrompt({
    previousSummary: previousSummary?.summary || null,
    messages,
  });
  const contents = buildPrompt({
    systemPrompt: process.env.SYSTEM_PROMPT || "",
    history: [],
    userMessage: summaryPrompt,
  });
  const result = await generate({ contents });
  const summary = (result.text || "").trim();

  if (!summary) {
    logger.warn(`Summary generation returned empty text for ${channel_id}/${thread_ts}`);
    return null;
  }

  const messageCount = previousSummary?.message_count || 0;
  const summarizedMessageCount = messageCount + messages.length;
  const saved = await saveSummary({
    channel_id,
    thread_ts,
    summary,
    message_count: summarizedMessageCount,
  });

  return saved ? { summary, messageCount: summarizedMessageCount, result } : null;
}

export async function updateSummaryIfNeeded({ channel_id, thread_ts }) {
  try {
    const triggerMessages = getPositiveIntegerEnv("SUMMARY_TRIGGER_MESSAGES", DEFAULT_TRIGGER_MESSAGES);
    const updateInterval = getPositiveIntegerEnv("SUMMARY_UPDATE_INTERVAL", DEFAULT_UPDATE_INTERVAL);
    const existingSummary = await getSummary(channel_id, thread_ts);
    const messages = await getLatestReplies(channel_id, thread_ts, null);
    const summarizedCount = existingSummary?.message_count || 0;
    const messageCount = messages.length;

    if (!shouldUpdateSummary({ messageCount, summarizedCount, triggerMessages, updateInterval })) return false;

    const newMessages = messages.slice(summarizedCount);
    if (newMessages.length === 0) return false;

    const saved = await generateAndSaveSummary({
      channel_id,
      thread_ts,
      messages: newMessages,
      previousSummary: existingSummary,
    });
    if (!saved) return false;

    logger.info(`Conversation summary updated: channel=${channel_id} thread=${thread_ts} messages=${messageCount}`);
    return true;
  } catch (err) {
    logger.error(`Conversation summary update failed: ${err.message}`);
    return false;
  }
}

/**
 * Explicitly summarize a thread, ignoring the automatic update thresholds.
 * Existing summaries are incrementally updated with messages that have not
 * yet been included in the stored message_count.
 */
export async function summarizeThread({ channel_id, thread_ts }) {
  const existingSummary = await getSummary(channel_id, thread_ts);
  const messages = await getLatestReplies(channel_id, thread_ts, null);

  if (messages.length === 0) return null;

  const summarizedCount = existingSummary?.message_count || 0;
  const newMessages = existingSummary ? messages.slice(summarizedCount) : messages;

  if (newMessages.length === 0 && existingSummary?.summary) {
    return {
      summary: existingSummary.summary,
      messageCount: existingSummary.message_count,
      result: null,
      reused: true,
    };
  }

  const saved = await generateAndSaveSummary({
    channel_id,
    thread_ts,
    messages: newMessages,
    previousSummary: existingSummary,
  });

  if (!saved) return null;
  return { ...saved, reused: false };
}
