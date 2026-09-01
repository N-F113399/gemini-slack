import logger from "../utils/logger.js";
import { getLatestReplies, saveMessage } from "./messageStore.js";
import { generate } from "./gemini/geminiService.js";
import { buildPrompt } from "./gemini/promptBuilder.js";
import { sendSlackMessage } from "./slackService.js";

const ACTIONS = new Set(["detail", "concise", "translate", "regenerate", "rewrite"]);

const STYLE_INSTRUCTIONS = {
  detail: "Rewrite the previous assistant answer with more detail. Add useful explanation, context, examples, and important caveats. Do not change factual meaning.",
  concise: "Rewrite the previous assistant answer to be substantially more concise. Preserve important facts and actionable information. Remove repetition and unnecessary detail.",
};

export function parseShortcutPayload(payload = {}) {
  const callbackId = payload.callback_id || payload.callbackId || "";
  const action = callbackId.replace(/^gemini_/, "").toLowerCase();

  return {
    action: ACTIONS.has(action) ? action : null,
    channelId: payload.channel?.id || payload.channel_id || null,
    messageTs: payload.message?.ts || payload.message_ts || null,
    threadTs: payload.message?.thread_ts || payload.thread_ts || payload.message?.ts || null,
    responseUrl: payload.response_url || null,
  };
}

async function getLatestBotMessage(channelId, threadTs) {
  if (!threadTs) return null;
  const messages = await getLatestReplies(channelId, threadTs, 10);
  return [...messages].reverse().find((message) => message.role === "bot") || null;
}

export async function handleSlackShortcut(payload) {
  const parsed = parseShortcutPayload(payload);
  logger.info(`Message shortcut received: ${parsed.action || "unknown"}`);

  if (!parsed.action) return { ...parsed, supported: false, reason: "unsupported_action" };
  if (!parsed.channelId || !parsed.messageTs) return { ...parsed, supported: false, reason: "missing_message_context" };
  if (parsed.action !== "detail" && parsed.action !== "concise") {
    return { ...parsed, supported: false, reason: "not_implemented" };
  }

  const sourceMessage = await getLatestBotMessage(parsed.channelId, parsed.threadTs);
  if (!sourceMessage) return { ...parsed, supported: false, reason: "no_bot_message" };

  const contents = buildPrompt({
    systemPrompt: process.env.SYSTEM_PROMPT || "",
    history: [],
    userMessage: `${STYLE_INSTRUCTIONS[parsed.action]}\n\nPrevious assistant answer:\n${sourceMessage.text}`,
  });

  const result = await generate({ contents });
  const reply = (result.text || "").trim();
  if (!reply) return { ...parsed, supported: false, reason: "empty_response" };

  const slackResponse = await sendSlackMessage(
    parsed.channelId,
    parsed.threadTs,
    `${reply}\n\n---\n使用モデル: ${result.model}`,
  );
  if (!slackResponse?.ok) return { ...parsed, supported: false, reason: "slack_error" };

  const botTs = slackResponse.ts || slackResponse.message?.ts;
  if (botTs) {
    await saveMessage({
      channel_id: parsed.channelId,
      thread_ts: parsed.threadTs,
      message_ts: botTs,
      user_id: null,
      role: "bot",
      text: reply,
    });
  }

  return { ...parsed, supported: true, executed: true, reply, model: result.model };
}
