import { getLatestReplies } from "./messageStore.js";
import { getSummary } from "./conversationSummaryStore.js";

const DEFAULT_RECENT_MESSAGES = 10;

/**
 * Build the conversation context used by the AI.
 *
 * The current message is intentionally excluded from recentMessages so the
 * caller can pass it separately as the current user message.
 */
export async function buildContext({
  channel_id,
  thread_ts,
  current_message_ts,
  recentLimit = DEFAULT_RECENT_MESSAGES,
}) {
  const [summaryRecord, recentMessages] = await Promise.all([
    getSummary(channel_id, thread_ts),
    getLatestReplies(channel_id, thread_ts, recentLimit + 1),
  ]);

  const filteredMessages = recentMessages.filter(
    (message) => message.message_ts !== current_message_ts,
  );

  return {
    summary: summaryRecord?.summary || null,
    summaryMessageCount: summaryRecord?.message_count || 0,
    recentMessages: filteredMessages.slice(-recentLimit),
  };
}
