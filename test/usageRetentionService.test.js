import test from "node:test";
import assert from "node:assert/strict";
import { getUsageRetentionDays, retentionCutoff, deleteExpiredUsageEvents } from "../src/services/usage/usageRetentionService.js";

test("retentionCutoff subtracts the configured number of days", () => {
  const cutoff = retentionCutoff(new Date("2026-09-01T12:00:00Z"), 90);
  assert.equal(cutoff.toISOString(), "2026-06-03T12:00:00.000Z");
});

test("getUsageRetentionDays falls back to 90", () => {
  const previous = process.env.USAGE_RETENTION_DAYS;
  delete process.env.USAGE_RETENTION_DAYS;
  try {
    assert.equal(getUsageRetentionDays(), 90);
  } finally {
    if (previous === undefined) delete process.env.USAGE_RETENTION_DAYS;
    else process.env.USAGE_RETENTION_DAYS = previous;
  }
});

test("deleteExpiredUsageEvents uses the calculated cutoff", async () => {
  const calls = [];
  const store = {
    from(table) {
      calls.push(["from", table]);
      return {
        delete() {
          calls.push(["delete"]);
          return this;
        },
        lt(column, value) {
          calls.push(["lt", column, value]);
          return this;
        },
        async select(column) {
          calls.push(["select", column]);
          return { data: [{ id: 1 }, { id: 2 }], error: null };
        },
      };
    },
  };

  const result = await deleteExpiredUsageEvents({
    now: new Date("2026-09-01T12:00:00Z"),
    retentionDays: 30,
    store,
  });

  assert.equal(result.cutoff, "2026-08-02T12:00:00.000Z");
  assert.equal(result.deletedCount, 2);
  assert.deepEqual(calls, [
    ["from", "usage_events"],
    ["delete"],
    ["lt", "occurred_at", "2026-08-02T12:00:00.000Z"],
    ["select", "id"],
  ]);
});
