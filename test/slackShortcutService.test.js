import test from "node:test";
import assert from "node:assert/strict";
import { parseShortcutPayload } from "../src/services/slackShortcutService.js";

test("parseShortcutPayload parses a Slack message shortcut payload", () => {
  const result = parseShortcutPayload(JSON.stringify({
    callback_id: "gemini_detail",
    channel: { id: "C123" },
    message: { ts: "123.456", thread_ts: "123.000" },
  }));

  assert.equal(result.action, "detail");
  assert.equal(result.callbackId, "gemini_detail");
  assert.equal(result.channelId, "C123");
  assert.equal(result.messageTs, "123.456");
  assert.equal(result.threadTs, "123.000");
});

test("parseShortcutPayload supports all five public shortcuts", () => {
  for (const [callbackId, action] of [
    ["gemini_detail", "detail"],
    ["gemini_concise", "concise"],
    ["gemini_translate_en", "translate_en"],
    ["gemini_summarize", "summarize"],
    ["gemini_rewrite", "rewrite"],
  ]) {
    const result = parseShortcutPayload({ callback_id: callbackId });
    assert.equal(result.action, action);
  }
});

test("parseShortcutPayload rejects unsupported callbacks", () => {
  const result = parseShortcutPayload({ callback_id: "gemini_unknown" });
  assert.equal(result.action, null);
});

test("parseShortcutPayload uses the message timestamp as thread timestamp for root messages", () => {
  const result = parseShortcutPayload({
    callback_id: "gemini_summarize",
    channel: { id: "C123" },
    message: { ts: "123.456" },
  });

  assert.equal(result.threadTs, "123.456");
});
