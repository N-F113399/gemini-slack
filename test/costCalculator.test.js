import test from "node:test";
import assert from "node:assert/strict";
import { calculateUsageCost, getPricing, annotateUsageEventCost } from "../src/services/usage/costCalculator.js";

test("calculates Tavily cost from credits", () => {
  assert.equal(calculateUsageCost({ provider: "tavily", service: "search", credits: 10, requests: 1 }), 0.08);
});

test("calculates Exa request cost and additional result cost", () => {
  assert.equal(calculateUsageCost({ provider: "exa", service: "search", requests: 1, resultCount: 10 }), 0.007);
  assert.equal(calculateUsageCost({ provider: "exa", service: "search", requests: 1, resultCount: 12 }), 0.009);
});

test("calculates You.com cost per request", () => {
  assert.equal(calculateUsageCost({ provider: "you", service: "search", requests: 20 }), 0.1);
});

test("calculates Gemini token cost", () => {
  assert.equal(calculateUsageCost({
    provider: "gemini",
    service: "gemini",
    model: "gemini-3.5-flash-lite",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  }), 2.8);
});

test("returns null for unknown pricing", () => {
  assert.equal(getPricing({ provider: "unknown", service: "search" }), null);
});

test("annotates event with estimated cost", () => {
  const event = {
    provider: "tavily",
    service: "search",
    tokens: { input: null, output: null, total: null },
    search: { credits: 2, requests: 1 },
    metadata: { resultCount: 5 },
    estimatedCostUsd: null,
  };
  const result = annotateUsageEventCost(event);
  assert.equal(result.estimatedCostUsd, 0.016);
});
