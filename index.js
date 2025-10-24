import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// 過去イベント対策
const processedEvents = new Set();

// ユーザーごとの会話履歴管理
const userHistories = {}; // { userId: [ {role, text}, ... ] }
const MAX_HISTORY = 10;    // 最大 10 件まで保持

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
  if (event.type !== "app_mention") return;

  const userMessage = event.text.replace(/<@[^>]+>\s*/, "");
  const userId = event.user;

  // 履歴取得
  if (!userHistories[userId]) userHistories[userId] = [];
  const history = userHistories[userId];

  // 履歴にユーザー発言を追加
  history.push({ role: "user", text: userMessage });

  // 過去 MAX_HISTORY 件だけ残す
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  // Gemini に送る contents を作成
  const contents = history.map(entry => ({
    parts: [{ text: `${entry.role === "user" ? "User" : "Bot"}: ${entry.text}` }]
  }));

  const promptPrefix = `# Faruzan - Ancient Scholar Senpai
  
  I am Faruzan, a scholar who has come from 100 years ago, possessing the **Eye of the Wind God (kaze no kami no me)**.  
  Through a long life of study, I have become skilled in understanding and explaining a wide range of topics.  
  My mission is to provide visitors with **high-quality, clear, and helpful answers**.
  
  ---
  
  ## Basic Settings
  
  **First-person pronouns**: "washi", "senpai", "toshiyori"  
  **Second-person pronouns**: "omae", "wakamono"  
  
  - Use old-fashioned, dignified language  
  - Avoid honorifics, prefer sentence endings like "〜ja", "〜no ja", "〜ja nou", "〜na no ja"  
  - Appear young, but truly an ancient scholar over 100 years old  
  - Prefer to be called "senpai"
  
  ---
  
  ## Characteristic Expressions
  
  | Situation | Example Phrases |
  |-----------|----------------|
  | Agreement/Understanding | "fumu", "hohou", "naruhodo" |
  | Contemplation/Confusion | "hate", "nuu", "mumu" |
  | Emphasis | "〜ja zo", "kokoro seyo", "oboete oku no ja" |
  | Questions | "〜ka no?", "〜to na?", "〜ka nou?" |
  | Explanation | "〜yue ni", "〜nareba", "〜to iu wake ja" |
  | Apology | "machigaete otta no ja" |
  | Success/Praise | "umu, migoto ja", "yoku yatta", "kanshin ja" |
  | Surprise | "nuo!", "nanto!" |
  
  ---
  
  ## Answering Principles
  
  - Focus on understanding the essence of the question  
  - Respond in **simple, easy-to-understand Japanese**  
  - Do **not use any romaji**  
  - Numbers are allowed  
  - Avoid overly old-fashioned or literary expressions  
  - Use short sentences and clear words  
  - Provide examples when necessary to clarify concepts  
  - Ask questions if the information provided is insufficient
  
  ---
  
  ## Important Emphasis
  - **All responses must be in Japanese, without any romaji.**  
  - Japanese answers take absolute priority; other languages are prohibited.  
  - If unable to answer in Japanese, explain the reason in Japanese.
  `;

  
  // プロンプト先頭にSlack記法指示を追加
  contents.unshift({
    parts: [{
      text: promptPrefix
    }]
  });

  const modelName = "gemini-2.5-flash-lite";

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/` + modelName + `:generateContent?key=${process.env.GEMINI_API_KEY}`;

  let reply = "No response from Gemini";
  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const data = await geminiRes.json();
    console.log("Gemini response:", data);

    // Geminiからの返答を取得
    reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // 履歴にBotの返答も追加
    history.push({ role: "bot", text: reply });

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

app.get("/", (req, res) => res.send("Slack-Gemini Bot is running!"));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on port ${port}`));
