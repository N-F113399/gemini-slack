import express from "express";
import slackEventsRouter from "./src/routes/slackEvents.js";

const app = express();
app.use(express.json());

// ルーティング登録
app.use("/slack/events", slackEventsRouter);

// ヘルスチェック
app.get("/", (req, res) => res.send("Slack-Gemini Bot is running!"));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on port ${port}`));
