import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import logger from "./src/utils/logger.js";
import { checkEnvVars } from "./src/config/envCheck.js";
import { handleError } from "./src/utils/errorHandler.js";
import slackEventsRouter from "./src/routes/slackEvent.js";
import slackCommandsRouter from "./src/routes/slackCommand.js";
import slackShortcutRouter from "./src/routes/slackShortcut.js";
import usageRouter from "./src/routes/usage.js";
import usageQuotaRouter from "./src/routes/usageQuota.js";
import { usageTracker } from "./src/services/usage/usageTracker.js";
import { usageMonitorScheduler } from "./src/services/monitoring/usageMonitorScheduler.js";
import { usageRetentionScheduler } from "./src/services/usage/usageRetentionScheduler.js";
import { verifySlackSignature } from "./src/middleware/slackSignature.js";

dotenv.config();
checkEnvVars();

const { saveUsageEvent } = await import("./src/services/usage/usageEventStore.js");
usageTracker.setPersistence(saveUsageEvent);

const app = express();
const captureRawBody = (req, res, buf) => {
  req.rawBody = Buffer.from(buf);
};

app.use(bodyParser.json({ verify: captureRawBody, limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: false, verify: captureRawBody, limit: "1mb" }));
app.use("/slack/events", verifySlackSignature, slackEventsRouter);
app.use("/slack/commands", verifySlackSignature, slackCommandsRouter);
app.use("/slack/shortcuts", verifySlackSignature, slackShortcutRouter);
app.use("/usage", usageRouter);
app.use("/usage/quota", usageQuotaRouter);

app.use((err, req, res, next) => {
  const response = handleError(err, "Express");
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  usageMonitorScheduler.start();
  usageRetentionScheduler.start();
  logger.info(`🚀 Server running on port ${PORT}`);
});
