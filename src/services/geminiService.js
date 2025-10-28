import {
  getUserHistory,
  addUserMessage,
  addBotMessage,
} from "../utils/historyManager.js";
import { sendSlackMessage } from "./slackService.js";

export async function handleAppMention(event) {
  const userId = event.user;
  const userMessage = event.text.replace(/<@[^>]+>\s*/, "");

  const history = getUserHistory(userId);
  addUserMessage(userId, userMessage);

  const modelName = "gemini-2.5-flash-lite";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const contents = [
    { parts: [{ text: process.env.SYSTEM_PROMPT }] },
    ...history.map((entry) => ({
      parts: [
        { text: `${entry.role === "user" ? "User" : "Bot"}: ${entry.text}` },
      ],
    })),
  ];

  // 🕒 タイムアウト設定（ms単位）
  const TIMEOUT_MS = 10000; // 10秒（任意で調整可）

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
      signal: controller.signal, // ← これが重要
    });

    clearTimeout(timeout);

    const data = await res.json();
    if (!res.ok) {
      const errMsg = `Gemini API Error: ${data.error?.message || "Unknown error"}`;
      await sendSlackMessage(event.channel, event.ts, errMsg);
      return;
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "（応答がありませんでした）";
    addBotMessage(userId, reply);
    await sendSlackMessage(event.channel, event.ts, reply);
  } catch (error) {
    clearTimeout(timeout);

    if (error.name === "AbortError") {
      const timeoutMsg = "Geminiの応答がタイムアウトしました（10秒経過）。";
      console.warn(timeoutMsg);
      await sendSlackMessage(event.channel, event.ts, timeoutMsg);
    } else {
      const errorMsg = `Gemini通信中にエラーが発生しました: ${error.message}`;
      console.error(errorMsg);
      await sendSlackMessage(event.channel, event.ts, errorMsg);
    }
  }
}
