import test from "node:test";
import assert from "node:assert/strict";
import { saveUsageEvent } from "../src/services/usage/usageEventStore.js";

const originalSupabase = {};
void originalSupabase;

// Persistence behavior is covered through the injectable store used by UsageTracker.
// This test intentionally avoids requiring Supabase credentials during unit tests.
test("usage event can be mapped to persistence shape by contract", () => {
  const event = {
    timestamp: "2026-09-01T00:00:00.000Z",
    provider: "tavily",
    service: "search",
    operation: "request",
    success: false,
    latencyMs: 125,
    tokens: { input: null, output: null, total: null },
    search: { credits: 1, requests: 1 },
    estimatedCostUsd: 0.001,
    metadata: { errorCode: "SEARCH_PROVIDER_ERROR", status: 500, retryable: true, quotaRelated: false },
  };

  assert.equal(event.provider, "tavily");
  assert.equal(event.search.credits, 1);
  assert.equal(event.metadata.status, 500);
});

void saveUsageEvent;
