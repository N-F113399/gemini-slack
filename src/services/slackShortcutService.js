import logger from "../utils/logger.js";

const ACTIONS = new Set(["detail", "concise", "translate", "regenerate", "rewrite"]);

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

export async function handleSlackShortcut(payload) {
  const parsed = parseShortcutPayload(payload);
  logger.info(`Message shortcut received: ${parsed.action || "unknown"}`);

  if (!parsed.action) return { ...parsed, supported: false, reason: "unsupported_action" };
  if (!parsed.channelId || !parsed.messageTs) return { ...parsed, supported: false, reason: "missing_message_context" };

  return { ...parsed, supported: true };
}
