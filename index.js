import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import logger from "./src/utils/logger.js";
import { checkEnvVars } from "./src/config/envCheck.js";
import { handleError } from "./src/utils/errorHandler.js";
import slackEventsRouter from "./src/routes/slackEvent.js";

dotenv.config();
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