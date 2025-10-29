import fetch from "node-fetch";
import { sendSlackMessage, fetchSlackThreadHistory } from "./slackService.js";

export async function handleAppMention(event) {
  const userId = event.user;
  const channelId = event.channel;
  const userMessage = event.text.replace(/<@[^>]+>\s*/, "");

  // Slack履歴取得（直近10件）
  const history = await fetchSlackThreadHistory(channelId, event.ts);

  const modelName = "gemini-2.5-flash-lite";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const contents = [
    { parts: [{ text: process.env.SYSTEM_PROMPT }] },
    ...history.map(entry => ({
      parts: [{ text: `${entry.role === "user" ? "User" : "Bot"}: ${entry.text}` }]
    })),
    { parts: [{ text: `User: ${userMessage}` }] }
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await res.json();
    if (!res.ok) {
      const errMsg = `Gemini API Error: ${data.error?.message || "Unknown error"}`;
      await sendSlackMessage(channelId, event.ts, errMsg);
      return;
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "（応答がありませんでした）";
    await sendSlackMessage(channelId, event.ts, reply);

  } catch (error) {
    const errorMsg =
      error.name === "AbortError"
        ? "Gemini APIの応答がタイムアウトしました。"
        : `Gemini通信中にエラーが発生しました: ${error.message}`;
    console.error(errorMsg);
    await sendSlackMessage(channelId, event.ts, errorMsg);
  }
}
