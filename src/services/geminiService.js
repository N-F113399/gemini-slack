import { getUserHistory, addUserMessage, addBotMessage } from "../utils/historyManager.js";
import { sendSlackMessage } from "./slackService.js";
import { faruzanPrompt } from "../prompts/faruzanPrompt.js";

export async function handleAppMention(event) {
  const userId = event.user;
  const userMessage = event.text.replace(/<@[^>]+>\s*/, "");

  const history = getUserHistory(userId);
  addUserMessage(userId, userMessage);

  const modelName = "gemini-2.5-flash-lite";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const contents = [
    { parts: [{ text: faruzanPrompt.trim() }] },
    ...history.map(entry => ({
      parts: [{ text: `${entry.role === "user" ? "User" : "Bot"}: ${entry.text}` }]
    }))
  ];

  try {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = `Gemini API Error: ${data.error?.message || "Unknown error"}`;
      await sendSlackMessage(event.channel, event.ts, errMsg);
      return;
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "（応答がありませんでした）";
    addBotMessage(userId, reply);

    await sendSlackMessage(event.channel, event.ts, reply);

  } catch (error) {
    const errorMsg = `Gemini通信中にエラーが発生しました: ${error.message}`;
    console.error(errorMsg);
    await sendSlackMessage(event.channel, event.ts, errorMsg);
  }
}
