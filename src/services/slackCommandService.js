import logger from "../utils/logger.js";
import { getLatestReplies, saveMessage } from "./messageStore.js";
import { generate } from "./gemini/geminiService.js";
import { buildPrompt } from "./gemini/promptBuilder.js";
import { sendSlackMessage } from "./slackService.js";

const COMMANDS = new Set([
  "detail",
  "concise",
  "summarize",
  "translate",
  "regenerate",
  "rewrite",
]);

const STYLE_INSTRUCTIONS = {
  detail: "Rewrite the previous assistant answer with more detail. Add useful explanation, context, examples, and important caveats. Do not change factual meaning.",
  concise: "Rewrite the previous assistant answer to be substantially more concise. Preserve the important facts and actionable information. Remove repetition and unnecessary detail.",
};

export function parseSlackCommand(text = "") {
  const normalized = text.trim().replace(/^\/gemini\s*/i, "").trim();
  const [command, ...args] = normalized.split(/\s+/);

  if (!command || !COMMANDS.has(command.toLowerCase())) {
    return { command: null, args };
  }

  return { command: command.toLowerCase(), args };
}

async function getLatestBotMessage(channelId, threadTs) {
  if (!threadTs) return null;

  const messages = await getLatestReplies(channelId, threadTs, 10);
  return [...messages].reverse().find((message) => message.role === "bot") || null;
}

export async function transformLatestAnswer({ channelId, threadTs, command }) {
  const sourceMessage = await getLatestBotMessage(channelId, threadTs);
  if (!sourceMessage) {
    return { ok: false, reason: "no_bot_message" };
  }

  const contents = buildPrompt({
    systemPrompt: process.env.SYSTEM_PROMPT || "",
    history: [],
    userMessage: `${STYLE_INSTRUCTIONS[command]}\n\nPrevious assistant answer:\n${sourceMessage.text}`,
  });

  const result = await generate({ contents });
  const reply = (result.text || "").trim();
  if (!reply) return { ok: false, reason: "empty_response" };

  const slackResponse = await sendSlackMessage(channelId, threadTs, `${reply}\n\n---\n使用モデル: ${result.model}`);
  if (!slackResponse?.ok) {
    return { ok: false, reason: "slack_error" };
  }

  const botTs = slackResponse.ts || slackResponse.message?.ts || String(Date.now() / 1000);
  await saveMessage({
    channel_id: channelId,
    thread_ts: threadTs,
    message_ts: botTs,
    user_id: null,
    role: "bot",
    text: reply,
  });

  return { ok: true, reply, model: result.model };
}

export async function handleSlackCommand(commandPayload) {
  const { command, args } = parseSlackCommand(commandPayload.text);

  logger.info(`Slash command received: ${command || "unknown"}`);

  if (!command) {
    return { command: null, args, supported: false };
  }

  if (command === "detail" || command === "concise") {
    if (!commandPayload.channel_id || !commandPayload.thread_ts) {
      return {
        command,
        args,
        supported: true,
        executed: false,
        reason: "thread_required",
      };
    }

    const result = await transformLatestAnswer({
      channelId: commandPayload.channel_id,
      threadTs: commandPayload.thread_ts,
      command,
    });

    return { command, args, supported: true, executed: result.ok, ...result };
  }

  return { command, args, supported: true, executed: false };
}
