import express from "express";
import slackEventsRouter from "./src/routes/slackEvent.js";

import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("=== 実行中のファイルパス ===", __filename);
console.log("=== 実行中のディレクトリ ===", __dirname);
console.log("=== routes の絶対パス ===", path.resolve(__dirname, "src/routes/slackEvent.js"));

const app = express();
app.use(express.json());

// ルーティング登録
app.use("/slack/events", slackEventsRouter);

// ヘルスチェック
app.get("/", (req, res) => res.send("Slack-Gemini Bot is running!"));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on port ${port}`));
