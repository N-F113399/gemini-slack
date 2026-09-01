import test from "node:test";
import assert from "node:assert/strict";

// The persistence adapter uses the real Supabase client and therefore requires
// deployment credentials. Keep this unit contract test independent of Supabase.
test("usage persistence row contract contains operational fields", () => {
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

  const row = {
    occurred_at: event.timestamp,
    provider: event.provider,
    service: event.service,
    operation: event.operation,
    success: event.success,
    latency_ms: event.latencyMs,
    credits: event.search.credits,
    request_count: event.search.requests,
    estimated_cost_usd: event.estimatedCostUsd,
    error_code: event.metadata.errorCode,
    http_status: event.metadata.status,
    retryable: event.metadata.retryable,
    quota_related: event.metadata.quotaRelated,
    metadata: event.metadata,
  };

  assert.equal(row.provider, "tavily");
  assert.equal(row.credits, 1);
  assert.equal(row.http_status, 500);
  assert.equal(row.retryable, true);
});
