import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Slackからのイベント受信
app.post("/slack/events", async (req, res) => {
  const { event } = req.body;
  if (event && event.type === "app_mention" && !event.bot_id) {
    const userMessage = event.text.replace(/<@[^>]+>\s*/, ""); // メンション除去

    // Gemini API呼び出し
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }] }],
        }),
      }
    );

    const data = await geminiRes.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini";

    // Slackへ返信
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify({
        channel: event.channel,
        thread_ts: event.ts,
        text: reply,
      }),
    });
  }
  res.sendStatus(200);
});

app.get("/", (req, res) => res.send("Slack bot is running!"));

app.listen(10000, () => console.log("Server running on port 10000"));
