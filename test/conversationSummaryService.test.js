import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSummaryPrompt,
  shouldUpdateSummary,
} from "../src/services/conversationSummaryUtils.js";

test("shouldUpdateSummary triggers the first summary at the threshold", () => {
  assert.equal(shouldUpdateSummary({ messageCount: 20, summarizedCount: 0, triggerMessages: 20, updateInterval: 10 }), true);
});

test("shouldUpdateSummary does not trigger before the threshold", () => {
  assert.equal(shouldUpdateSummary({ messageCount: 19, summarizedCount: 0, triggerMessages: 20, updateInterval: 10 }), false);
});

test("shouldUpdateSummary waits for the update interval", () => {
  assert.equal(shouldUpdateSummary({ messageCount: 29, summarizedCount: 20, triggerMessages: 20, updateInterval: 10 }), false);
  assert.equal(shouldUpdateSummary({ messageCount: 30, summarizedCount: 20, triggerMessages: 20, updateInterval: 10 }), true);
});

test("shouldUpdateSummary does not update when nothing has changed", () => {
  assert.equal(shouldUpdateSummary({ messageCount: 20, summarizedCount: 20, triggerMessages: 20, updateInterval: 10 }), false);
});

test("buildSummaryPrompt includes the previous summary and new messages", () => {
  const prompt = buildSummaryPrompt({
    previousSummary: "認証方式をJWTにする方針。",
    messages: [
      { role: "user", text: "有効期限は1時間にしたい" },
      { role: "bot", text: "了解しました" },
    ],
  });

  assert.match(prompt, /Previous conversation summary:/);
  assert.match(prompt, /認証方式をJWTにする方針。/);
  assert.match(prompt, /User: 有効期限は1時間にしたい/);
  assert.match(prompt, /Bot: 了解しました/);
});

test("buildSummaryPrompt works without a previous summary", () => {
  const prompt = buildSummaryPrompt({
    previousSummary: null,
    messages: [{ role: "user", text: "hello" }],
  });

  assert.doesNotMatch(prompt, /Previous conversation summary:/);
  assert.match(prompt, /User: hello/);
});
