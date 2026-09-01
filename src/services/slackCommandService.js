import logger from "../utils/logger.js";

const COMMANDS = new Set([
  "detail",
  "concise",
  "summarize",
  "translate",
  "regenerate",
  "rewrite",
]);

export function parseSlackCommand(text = "") {
  const normalized = text.trim().replace(/^\/gemini\s*/i, "").trim();
  const [command, ...args] = normalized.split(/\s+/);

  if (!command || !COMMANDS.has(command.toLowerCase())) {
    return { command: null, args };
  }

  return { command: command.toLowerCase(), args };
}

export async function handleSlackCommand(commandPayload) {
  const { command, args } = parseSlackCommand(commandPayload.text);

  logger.info(`Slash command received: ${command || "unknown"}`);

  return {
    command,
    args,
    supported: Boolean(command),
  };
}
