import test from "node:test";
import assert from "node:assert/strict";
import { UsageMonitorScheduler } from "../src/services/monitoring/usageMonitorScheduler.js";

test("runOnce evaluates and notifies alerts", async () => {
  let notified = null;
  const scheduler = new UsageMonitorScheduler({
    getReport: async () => ({ byProvider: { "search:tavily": { service: "search", provider: "tavily" } } }),
    getQuotaReport: async () => ({ quotas: [] }),
    evaluate: ({ summary }) => [{ type: "failure_rate", service: "search", provider: Object.keys(summary)[0], value: 0.4, threshold: 0.3 }],
    notify: async alerts => { notified = alerts; },
  });

  const result = await scheduler.runOnce(new Date("2026-09-01T00:00:00Z"));
  assert.equal(result.alerts, 1);
  assert.equal(notified.length, 1);
});

test("runOnce skips overlapping executions", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const scheduler = new UsageMonitorScheduler({
    getReport: async () => { await gate; return { byProvider: {} }; },
    getQuotaReport: async () => ({ quotas: [] }),
    evaluate: () => [],
    notify: async () => {},
  });

  const first = scheduler.runOnce();
  const second = await scheduler.runOnce();
  assert.equal(second.skipped, true);
  release();
  await first;
});

test("start and stop are idempotent", () => {
  const scheduler = new UsageMonitorScheduler();
  assert.equal(scheduler.start(), true);
  assert.equal(scheduler.start(), false);
  assert.equal(scheduler.stop(), true);
  assert.equal(scheduler.stop(), false);
});
