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

/**
 * Update the conversation summary when enough new messages have accumulated.
 * This function is intentionally non-throwing so summary failures never block
 * the normal Slack response flow.
 */
export async function updateSummaryIfNeeded({ channel_id, thread_ts }) {
  try {
    const triggerMessages = getPositiveIntegerEnv("SUMMARY_TRIGGER_MESSAGES", DEFAULT_TRIGGER_MESSAGES);
    const updateInterval = getPositiveIntegerEnv("SUMMARY_UPDATE_INTERVAL", DEFAULT_UPDATE_INTERVAL);
    const existingSummary = await getSummary(channel_id, thread_ts);
    const messages = await getLatestReplies(channel_id, thread_ts, Number.MAX_SAFE_INTEGER);
    const summarizedCount = existingSummary?.message_count || 0;
    const messageCount = messages.length;

    if (!shouldUpdateSummary({ messageCount, summarizedCount, triggerMessages, updateInterval })) return false;

    const newMessages = messages.slice(summarizedCount);
    if (newMessages.length === 0) return false;

    const summaryPrompt = buildSummaryPrompt({ previousSummary: existingSummary?.summary || null, messages: newMessages });
    const contents = buildPrompt({
      systemPrompt: process.env.SYSTEM_PROMPT || "",
      history: [],
      userMessage: summaryPrompt,
    });
    const result = await generate({ contents });
    const summary = (result.text || "").trim();
    if (!summary) {
      logger.warn(`Summary generation returned empty text for ${channel_id}/${thread_ts}`);
      return false;
    }

    const saved = await saveSummary({ channel_id, thread_ts, summary, message_count: messageCount });
    if (!saved) return false;

    logger.info(`Conversation summary updated: channel=${channel_id} thread=${thread_ts} messages=${messageCount}`);
    return true;
  } catch (err) {
    logger.error(`Conversation summary update failed: ${err.message}`);
    return false;
  }
}
