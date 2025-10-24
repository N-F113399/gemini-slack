import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 過去イベント対策用：処理済みイベントを記録
const processedEvents = new Set();

app.post("/slack/events", (req, res) => {
  const { type, challenge, event } = req.body;

  // 🔹 Slack URL verification
  if (type === "url_verification") {
    console.log("URL verification challenge:", challenge);
    return res.status(200).send({ challenge });
  }

  // 🔹 ここで先に 200 を返す（Slack の再送防止）
  res.sendStatus(200);

  // 🔹 イベントが存在する場合のみ処理
  if (!event || processedEvents.has(event.ts)) return;

  // 🔹 Bot 自身のイベントは無視
  if (event.bot_id) return;

  // 🔹 処理済みにマーク
  processedEvents.add(event.ts);

  handleEvent(event);
});

async function handleEvent(event) {
  if (event.type === "app_mention") {
    const userMessage = event.text.replace(/<@[^>]+>\s*/, "");

    // 🔹 Gemini API の URL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const requestBody = {
      contents: [
        { parts: [{ text: userMessage }] }
      ]
    };

    console.log("Sending to Gemini:", JSON.stringify(requestBody));

    let reply = "No response from Gemini";
    try {
      const geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      const data = await geminiRes.json();
      console.log("Gemini response:", data);

      reply = data.candidates?.[0]?.content?.parts?.[0]?.text || reply;
    } catch (err) {
      console.error("Error calling Gemini:", err);
    }

    // 🔹 Slack に返信
    try {
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        body: JSON.stringify({
          channel: event.channel,
          thread_ts: event.ts,
          text: reply
        })
      });
    } catch (err) {
      console.error("Error sending message to Slack:", err);
    }
  }
}

app.get("/", (req, res) => res.send("Slack-Gemini Bot is running!"));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on port ${port}`));
