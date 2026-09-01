/**
 * Build the Gemini contents payload from application-level conversation data.
 * Keeping prompt construction separate makes future context changes (such as
 * summaries or files) independent from the Gemini HTTP client.
 */
export function buildPrompt({ systemPrompt, history = [], summary = null, userMessage }) {
  const historyParts = history.map(reply => {
    const who = reply.role === "user" ? "User" : "Bot";
    return { parts: [{ text: `${who}: ${reply.text}` }] };
  });

  const summaryParts = summary
    ? [{ parts: [{ text: `Conversation Summary:\n${summary}` }] }]
    : [];

  return [
    { parts: [{ text: systemPrompt }] },
    ...summaryParts,
    ...historyParts,
    { parts: [{ text: `User: ${userMessage}` }] },
  ];
}
