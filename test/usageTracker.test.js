import test from "node:test";
import assert from "node:assert/strict";
import { UsageTracker } from "../src/services/usage/usageTracker.js";

test("records provider usage and summarizes totals", () => {
  const tracker = new UsageTracker({ maxEvents: 10 });

  tracker.record({
    provider: "tavily",
    service: "search",
    latencyMs: 100,
    credits: 1,
    requests: 1,
  });
  tracker.record({
    provider: "gemini",
    service: "gemini",
    latencyMs: 200,
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
    metadata: { model: "test-model" },
  });
  tracker.record({
    provider: "gemini",
    service: "gemini",
    success: false,
    latencyMs: 300,
  });

  const summary = tracker.summarize();
  assert.equal(summary["search:tavily"].credits, 1);
  assert.equal(summary["search:tavily"].requests, 1);
  assert.equal(summary["gemini:gemini"].inputTokens, 100);
  assert.equal(summary["gemini:gemini"].outputTokens, 40);
  assert.equal(summary["gemini:gemini"].totalTokens, 140);
  assert.equal(summary["gemini:gemini"].failures, 1);
  assert.equal(summary["gemini:gemini"].averageLatencyMs, 250);
});

test("keeps only the configured number of events", () => {
  const tracker = new UsageTracker({ maxEvents: 2 });
  tracker.record({ provider: "a", service: "search" });
  tracker.record({ provider: "b", service: "search" });
  tracker.record({ provider: "c", service: "search" });

  assert.deepEqual(tracker.list().map(event => event.provider), ["b", "c"]);
});

test("filters usage by provider and service", () => {
  const tracker = new UsageTracker();
  tracker.record({ provider: "tavily", service: "search" });
  tracker.record({ provider: "exa", service: "search" });
  tracker.record({ provider: "gemini", service: "gemini" });

  assert.equal(tracker.list({ provider: "tavily" }).length, 1);
  assert.equal(tracker.list({ service: "search" }).length, 2);
});

test("normalizes negative usage values to null instead of creating invalid persistence data", () => {
  const tracker = new UsageTracker();
  const event = tracker.record({
    provider: "gemini",
    service: "gemini",
    latencyMs: -1,
    inputTokens: -2,
    outputTokens: -3,
    totalTokens: -4,
    credits: -5,
    requests: -6,
  });

  assert.equal(event.latencyMs, null);
  assert.equal(event.tokens.input, null);
  assert.equal(event.tokens.output, null);
  assert.equal(event.tokens.total, null);
  assert.equal(event.search.credits, null);
  assert.equal(event.search.requests, null);
});

test("persists recorded events asynchronously", async () => {
  const persisted = [];
  const tracker = new UsageTracker({
    persistence: async event => {
      persisted.push(event);
    },
  });

  const event = tracker.record({
    provider: "gemini",
    service: "gemini",
  });

  assert.equal(persisted.length, 0);

  await Promise.resolve();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0], event);
});

test("swallows persistence failures without rejecting the caller flow", async () => {
  let called = false;
  const tracker = new UsageTracker({
    persistence: async () => {
      called = true;
      throw new Error("persist failed");
    },
  });

  tracker.record({
    provider: "gemini",
    service: "gemini",
  });

  await Promise.resolve();
  assert.equal(called, true);
});
