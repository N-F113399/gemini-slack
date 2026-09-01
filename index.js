import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import logger from "./src/utils/logger.js";
import { checkEnvVars } from "./src/config/envCheck.js";
import { handleError } from "./src/utils/errorHandler.js";
import slackEventsRouter from "./src/routes/slackEvent.js";
import slackCommandsRouter from "./src/routes/slackCommand.js";
import slackShortcutRouter from "./src/routes/slackShortcut.js";

dotenv.config();
checkEnvVars();

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use("/slack/events", slackEventsRouter);
app.use("/slack/commands", slackCommandsRouter);
app.use("/slack/shortcuts", slackShortcutRouter);

// グローバルエラーハンドラ
app.use((err, req, res, next) => {
  const response = handleError(err, "Express");
  res.status(500).json(response);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});
