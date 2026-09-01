import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "../src/services/gemini/promptBuilder.js";

test("buildPrompt builds system prompt, history, and current user message", () => {
  const contents = buildPrompt({
    systemPrompt: "You are a helpful assistant.",
    history: [
      { role: "user", text: "前の質問" },
      { role: "bot", text: "前の回答" },
    ],
    userMessage: "現在の質問",
  });

  assert.deepEqual(contents, [
    { parts: [{ text: "You are a helpful assistant." }] },
    { parts: [{ text: "User: 前の質問" }] },
    { parts: [{ text: "Bot: 前の回答" }] },
    { parts: [{ text: "User: 現在の質問" }] },
  ]);
});

test("buildPrompt handles an empty history", () => {
  const contents = buildPrompt({
    systemPrompt: "system",
    history: [],
    userMessage: "hello",
  });

  assert.deepEqual(contents, [
    { parts: [{ text: "system" }] },
    { parts: [{ text: "User: hello" }] },
  ]);
});

test("buildPrompt does not mutate history", () => {
  const history = [{ role: "user", text: "hello" }];
  const original = structuredClone(history);

  buildPrompt({
    systemPrompt: "system",
    history,
    userMessage: "world",
  });

  assert.deepEqual(history, original);
});
