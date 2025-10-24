import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 過去イベント対策
const processedEvents = new Set();

// Markdown → Slack形式変換関数
function markdownToSlack(md) {
  let text = md;

  // 見出し (#, ##, ###) → 太字
  text = text.replace(/^### (.+)$/gm, "*$1*");
  text = text.replace(/^## (.+)$/gm, "*$1*");
  text = text.replace(/^# (.+)$/gm, "*$1*");

  // 箇条書き (- または *) → •
  text = text.replace(/^\s*[-*] (.+)$/gm, "• $1");

  // 改行統一
  text = text.replace(/\r\n/g, "\n");

  return text;
}

app.post("/slack/events", (req, res) => {
  const { type, challenge, event } = req.body;

  // URL verification
  if (type === "url_verification") {
    console.log("URL verification challenge:", challenge);
    return res.status(200).send({ challenge });
  }

  // Slack に先に 200 を返す
  res.sendStatus(200);

  // イベントが存在しない / 既処理なら無視
  if (!event || processedEvents.has(event.ts)) return;

  // Bot自身のイベントは無視
  if (event.bot_id) return;

  processedEvents.add(event.ts);

  handleEvent(event);
});

async function handleEvent(event) {
  if (event.type === "app_mention") {
    const userMessage = event.text.replace(/<@[^>]+>\s*/, "");

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-live:generateContent?key=${process.env.GEMINI_API_KEY}`;

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

      const mdText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Markdownかどうか判定
      const isMarkdown = /(^# |\n-|^\* )/m.test(mdText);
      reply = isMarkdown ? markdownToSlack(mdText) : mdText;

    } catch (err) {
      console.error("Error calling Gemini:", err);
    }

    // Slack に返信
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
