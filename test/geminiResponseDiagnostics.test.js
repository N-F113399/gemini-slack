import test from "node:test";
import assert from "node:assert/strict";
import { getGeminiResponseDiagnostics, getGeminiResponseText } from "../src/services/gemini/geminiService.js";

test("Gemini diagnostics capture finish reason, model, output length, and token usage", () => {
  const diagnostics = getGeminiResponseDiagnostics({
    modelVersion: "gemini-test",
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [{ text: "hello" }, { text: " world" }, { inlineData: { mimeType: "image/png" } }],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 7,
      totalTokenCount: 19,
    },
  });

  assert.deepEqual(diagnostics, {
    finishReason: "STOP",
    model: "gemini-test",
    candidateCount: 1,
    outputTextLength: 11,
    promptBlockReason: null,
    inputTokens: 12,
    outputTokens: 7,
    totalTokens: 19,
  });
});

test("Gemini diagnostics identify MAX_TOKENS and prompt blocking", () => {
  const diagnostics = getGeminiResponseDiagnostics({
    promptFeedback: { blockReason: "SAFETY" },
    candidates: [
      {
        finishReason: "MAX_TOKENS",
        content: { parts: [{ text: "partial answer" }] },
      },
    ],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 100 },
  });

  assert.equal(diagnostics.finishReason, "MAX_TOKENS");
  assert.equal(diagnostics.promptBlockReason, "SAFETY");
  assert.equal(diagnostics.outputTextLength, 14);
  assert.equal(diagnostics.totalTokens, null);
});

test("Gemini diagnostics handle missing candidate metadata", () => {
  assert.deepEqual(getGeminiResponseDiagnostics({}), {
    finishReason: "UNKNOWN",
    model: null,
    candidateCount: 0,
    outputTextLength: 0,
    promptBlockReason: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: null,
  });
});


test("Gemini response text concatenates all text parts in order and ignores non-text parts", () => {
  const data = {
    candidates: [{
      content: {
        parts: [
          { text: "また急に、そんな短い言葉で" },
          { inlineData: { mimeType: "image/png" } },
          { text: "私を試すの？" },
        ],
      },
    }],
  };

  assert.equal(getGeminiResponseText(data), "また急に、そんな短い言葉で私を試すの？");
});

test("Gemini response text handles missing candidates and parts", () => {
  assert.equal(getGeminiResponseText({}), "");
  assert.equal(getGeminiResponseText({ candidates: [{ content: { parts: [] } }] }), "");
});

test("Gemini diagnostics report part counts and text lengths without logging content", () => {
  const diagnostics = getGeminiResponseDiagnostics({
    candidates: [{
      content: {
        parts: [{ text: "first" }, { inlineData: { mimeType: "image/png" } }, { text: "second!" }],
      },
    }],
  });

  assert.equal(diagnostics.partCount, 3);
  assert.deepEqual(diagnostics.textPartLengths, [5, 7]);
  assert.equal(diagnostics.nonTextPartCount, 1);
  assert.equal(diagnostics.outputTextLength, 12);
});
