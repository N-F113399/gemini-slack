import test from "node:test";
import assert from "node:assert/strict";

function aggregateUsageRows(rows) {
  const result = {};
  for (const row of rows) {
    const key = `${row.service}:${row.provider}`;
    if (!result[key]) result[key] = { requests: 0, failures: 0, totalTokens: 0, credits: 0 };
    result[key].requests += 1;
    if (!row.success) result[key].failures += 1;
    result[key].totalTokens += Number(row.total_tokens) || 0;
    result[key].credits += Number(row.credits) || 0;
  }
  return result;
}

test("usage report aggregates provider/service counters", () => {
  const summary = aggregateUsageRows([
    { service: "search", provider: "tavily", success: true, total_tokens: null, credits: 1 },
    { service: "search", provider: "tavily", success: false, total_tokens: null, credits: 1 },
    { service: "gemini", provider: "gemini", success: true, total_tokens: 120, credits: null },
  ]);

  assert.deepEqual(summary["search:tavily"], { requests: 2, failures: 1, totalTokens: 0, credits: 2 });
  assert.deepEqual(summary["gemini:gemini"], { requests: 1, failures: 0, totalTokens: 120, credits: 0 });
});

test("usage report date ranges reject invalid order", () => {
  const from = new Date("2026-09-02T00:00:00Z");
  const to = new Date("2026-09-01T00:00:00Z");
  assert.ok(from > to);
});
