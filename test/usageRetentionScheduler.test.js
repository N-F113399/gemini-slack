import test from "node:test";
import assert from "node:assert/strict";
import { UsageRetentionScheduler } from "../src/services/usage/usageRetentionScheduler.js";

test("runOnce performs cleanup", async () => {
  let receivedNow = null;
  const scheduler = new UsageRetentionScheduler({
    cleanup: async ({ now }) => {
      receivedNow = now;
      return { cutoff: "2026-08-01T00:00:00.000Z", deletedCount: 3 };
    },
  });
  const now = new Date("2026-09-01T00:00:00Z");
  const result = await scheduler.runOnce(now);
  assert.equal(result.deletedCount, 3);
  assert.equal(receivedNow, now);
});

test("runOnce skips overlapping executions", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const scheduler = new UsageRetentionScheduler({
    cleanup: async () => {
      await gate;
      return { deletedCount: 1 };
    },
  });
  const first = scheduler.runOnce();
  const second = await scheduler.runOnce();
  assert.equal(second.skipped, true);
  release();
  await first;
});

test("start and stop are idempotent", () => {
  const scheduler = new UsageRetentionScheduler({ cleanup: async () => ({ deletedCount: 0 }) });
  assert.equal(scheduler.start(), true);
  assert.equal(scheduler.start(), false);
  assert.equal(scheduler.stop(), true);
  assert.equal(scheduler.stop(), false);
});
