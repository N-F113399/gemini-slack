/**
 * Build the Gemini contents payload from application-level conversation data.
 * Keeping prompt construction separate makes future context changes (such as
 * summaries or files) independent from the Gemini HTTP client.
 */
export function buildPrompt({ systemPrompt, history, userMessage }) {
  const historyParts = history.map(reply => {
    const who = reply.role === "user" ? "User" : "Bot";
    return { parts: [{ text: `${who}: ${reply.text}` }] };
  });

  return [
    { parts: [{ text: systemPrompt }] },
    ...historyParts,
    { parts: [{ text: `User: ${userMessage}` }] },
  ];
}
