import logger from "../utils/logger.js";

const COMMANDS = new Set(["詳しく", "簡潔に", "要約", "翻訳", "再生成"]);

export function parseSlackCommand(text = "") {
  const normalized = text.trim().replace(/^\/gemini\s*/i, "").trim();
  const [command, ...args] = normalized.split(/\s+/);

  if (!command || !COMMANDS.has(command)) {
    return { command: null, args };
  }

  return { command, args };
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
