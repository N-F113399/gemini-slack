const ACTIONS = new Set(["detail", "concise", "translate", "translate_en", "regenerate", "rewrite", "summarize"]);

function decodePayload(payload) {
  if (typeof payload === "object" && payload !== null) return payload;
  if (typeof payload !== "string") return {};
  try { return JSON.parse(payload); } catch { return {}; }
}

export function parseShortcutPayload(rawPayload = {}) {
  const payload = decodePayload(rawPayload);
  const callbackId = payload.callback_id || payload.callbackId || "";
  const action = callbackId.replace(/^gemini[_-]/i, "").toLowerCase();

  return {
    action: ACTIONS.has(action) ? action : null,
    callbackId,
    channelId: payload.channel?.id || payload.channel_id || null,
    messageTs: payload.message?.ts || payload.message_ts || null,
    threadTs: payload.message?.thread_ts || payload.thread_ts || payload.message?.ts || null,
    responseUrl: payload.response_url || null,
    payload,
  };
}
