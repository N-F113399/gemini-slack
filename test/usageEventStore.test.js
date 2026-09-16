import test from "node:test";
import assert from "node:assert/strict";
import { saveUsageEvent } from "../src/services/usage/usageEventStore.js";

function createDbClient() {
  const calls = [];
  const inserted = [];

  const query = {
    insert(rows) {
      calls.push({ method: "insert", rows });
      inserted.push(...rows);
      return query;
    },
    select() {
      calls.push({ method: "select" });
      return query;
    },
    async single() {
      calls.push({ method: "single" });
      return { data: inserted.at(-1), error: null };
    },
  };

  return {
    client: { from: table => {
      calls.push({ method: "from", table });
      return query;
    } },
    calls,
  };
}

test("maps usage event to the persistence row contract", async () => {
  const { client, calls } = createDbClient();
  const event = {
    timestamp: "2026-09-01T00:00:00.000Z",
    provider: "tavily",
    service: "search",
    operation: "request",
    success: false,
    latencyMs: 125,
    tokens: { input: null, output: null, total: null },
    search: { credits: 1, requests: 2 },
    metadata: { errorCode: "SEARCH_PROVIDER_ERROR", status: 500, retryable: true, quotaRelated: false },
  };

  const result = await saveUsageEvent(event, client);
  const insertCall = calls.find(call => call.method === "insert");
  const row = insertCall.rows[0];

  assert.equal(result.provider, "tavily");
  assert.equal(row.credits, 1);
  assert.equal(row.request_count, 2);
  assert.equal(row.http_status, 500);
  assert.equal(row.retryable, true);
  assert.equal(row.metadata.errorCode, "SEARCH_PROVIDER_ERROR");
});

test("defaults request_count to one when the event has no search request count", async () => {
  const { client, calls } = createDbClient();

  await saveUsageEvent({
    timestamp: "2026-09-01T00:00:00.000Z",
    provider: "gemini",
    service: "gemini",
    success: true,
  }, client);

  const insertCall = calls.find(call => call.method === "insert");
  assert.equal(insertCall.rows[0].request_count, 1);
});
