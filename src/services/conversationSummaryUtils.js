export const DEFAULT_TRIGGER_MESSAGES = 20;
export const DEFAULT_UPDATE_INTERVAL = 10;

export function getPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function shouldUpdateSummary({ messageCount, summarizedCount, triggerMessages, updateInterval }) {
  if (messageCount < triggerMessages) return false;
  if (messageCount <= summarizedCount) return false;
  if (summarizedCount > 0 && messageCount - summarizedCount < updateInterval) return false;
  return true;
}

export function buildSummaryPrompt({ previousSummary, messages }) {
  const summarySection = previousSummary
    ? `Previous conversation summary:\n${previousSummary}\n\n`
    : "";

  const formattedMessages = messages
    .map((message) => {
      const who = message.role === "user" ? "User" : "Bot";
      return `${who}: ${message.text}`;
    })
    .join("\n");

  return [
    "Create a concise, faithful summary of this Slack conversation for use as future AI context.",
    "Preserve important facts, decisions, requirements, constraints, unresolved questions, and relevant user preferences.",
    "Do not invent information. Remove greetings, repetition, and other details that are not useful for future context.",
    "Return only the summary text; do not add headings or commentary.",
    "",
    summarySection,
    "Conversation messages:",
    formattedMessages,
  ].join("\n");
}
