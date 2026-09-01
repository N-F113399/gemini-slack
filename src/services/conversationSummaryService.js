import logger from "../utils/logger.js";
import { getLatestReplies } from "./messageStore.js";
import { getSummary, saveSummary } from "./conversationSummaryStore.js";
import { generate } from "./gemini/geminiService.js";
import { buildPrompt } from "./gemini/promptBuilder.js";

const DEFAULT_TRIGGER_MESSAGES = 20;
const DEFAULT_UPDATE_INTERVAL = 10;

function getPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function formatMessages(messages) {
  return messages
    .map((message) => {
      const who = message.role === "user" ? "User" : "Bot";
      return `${who}: ${message.text}`;
    })
    .join("\n");
}

function buildSummaryPrompt({ previousSummary, messages }) {
  const summarySection = previousSummary
    ? `Previous conversation summary:\n${previousSummary}\n\n`
    : "";

  return [
    "Create a concise, faithful summary of this Slack conversation for use as future AI context.",
    "Preserve important facts, decisions, requirements, constraints, unresolved questions, and relevant user preferences.",
    "Do not invent information. Remove greetings, repetition, and other details that are not useful for future context.",
    "Return only the summary text; do not add headings or commentary.",
    "",
    summarySection,
    "Conversation messages:",
    formatMessages(messages),
  ].join("\n");
}

/**
 * Update the conversation summary when enough new messages have accumulated.
 * This function is intentionally non-throwing so summary failures never block
 * the normal Slack response flow.
 */
export async function updateSummaryIfNeeded({ channel_id, thread_ts }) {
  try {
    const triggerMessages = getPositiveIntegerEnv(
      "SUMMARY_TRIGGER_MESSAGES",
      DEFAULT_TRIGGER_MESSAGES,
    );
    const updateInterval = getPositiveIntegerEnv(
      "SUMMARY_UPDATE_INTERVAL",
      DEFAULT_UPDATE_INTERVAL,
    );

    const existingSummary = await getSummary(channel_id, thread_ts);
    const messages = await getLatestReplies(channel_id, thread_ts, Number.MAX_SAFE_INTEGER);
    const summarizedCount = existingSummary?.message_count || 0;
    const messageCount = messages.length;

    if (messageCount < triggerMessages) return false;
    if (messageCount <= summarizedCount) return false;
    if (summarizedCount > 0 && messageCount - summarizedCount < updateInterval) return false;

    const newMessages = messages.slice(summarizedCount);
    if (newMessages.length === 0) return false;

    const summaryPrompt = buildSummaryPrompt({
      previousSummary: existingSummary?.summary || null,
      messages: newMessages,
    });

    const systemPrompt = process.env.SYSTEM_PROMPT || "";
    const contents = buildPrompt({
      systemPrompt,
      history: [],
      userMessage: summaryPrompt,
    });

    const result = await generate({ contents });
    const summary = (result.text || "").trim();
    if (!summary) {
      logger.warn(`Summary generation returned empty text for ${channel_id}/${thread_ts}`);
      return false;
    }

    const saved = await saveSummary({
      channel_id,
      thread_ts,
      summary,
      message_count: messageCount,
    });

    if (!saved) return false;

    logger.info(
      `Conversation summary updated: channel=${channel_id} thread=${thread_ts} messages=${messageCount}`,
    );
    return true;
  } catch (err) {
    logger.error(`Conversation summary update failed: ${err.message}`);
    return false;
  }
}
