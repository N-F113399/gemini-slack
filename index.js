import dotenv from "dotenv";

// 🧩 dotenv読み込み（trueでロード結果を返す）
const envResult = dotenv.config();

console.log("✅ process.cwd():", process.cwd());
console.log("✅ __dirname:", import.meta.url);
console.log("✅ .env exists?", fs.existsSync(".env"));

if (envResult.error) {
  console.error("❌ dotenv failed to load:", envResult.error);
  process.exit(1);
}

import express from "express";
import bodyParser from "body-parser";
// import dotenv from "dotenv";
import logger from "./src/utils/logger.js";
import { checkEnvVars } from "./src/config/envCheck.js";
import { handleError } from "./src/utils/errorHandler.js";
import slackEventsRouter from "./src/routes/slackEvent.js";

// dotenv.config();
checkEnvVars();

const app = express();
app.use(bodyParser.json());
app.use("/slack/events", slackEventsRouter);

// グローバルエラーハンドラ
app.use((err, req, res, next) => {
  const response = handleError(err, "Express");
  res.status(500).json(response);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});