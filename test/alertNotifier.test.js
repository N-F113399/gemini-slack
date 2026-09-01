import test from "node:test";
import assert from "node:assert/strict";
import { formatUsageAlert, notifyUsageAlerts } from "../src/services/monitoring/alertNotifier.js";

test("formatUsageAlert formats failure rate alerts", () => {
  assert.equal(
    formatUsageAlert({ type: "failure_rate", service: "search", provider: "tavily", value: 0.35, threshold: 0.3 }),
    "⚠️ Failure rate: search/tavily is 35.0% (threshold: 30.0%)"
  );
});

test("formatUsageAlert formats latency alerts", () => {
  assert.equal(
    formatUsageAlert({ type: "latency", service: "gemini", provider: "gemini", value: 6100, threshold: 5000 }),
    "⚠️ Latency: gemini/gemini is 6100ms (threshold: 5000ms)"
  );
});

test("notifyUsageAlerts sends every alert", async () => {
  const messages = [];
  const result = await notifyUsageAlerts([
    { type: "failure_rate", service: "search", provider: "tavily", value: 0.4, threshold: 0.3 },
    { type: "quota_utilization", service: "search", provider: "you", value: 0.9, threshold: 0.8 },
  ], { send: async message => messages.push(message) });

  assert.equal(result.sent, 2);
  assert.equal(messages.length, 2);
  assert.match(messages[1], /Free quota utilization/);
});

test("notifyUsageAlerts does nothing for empty alerts", async () => {
  const result = await notifyUsageAlerts([], { send: async () => { throw new Error("must not send"); } });
  assert.deepEqual(result, { sent: 0 });
});
