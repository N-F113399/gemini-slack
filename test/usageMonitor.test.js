import test from "node:test";
import assert from "node:assert/strict";
import { evaluateUsageAlerts, MONITORING_DEFAULTS } from "../src/services/monitoring/usageMonitor.js";

test("returns no alerts when metrics are below thresholds", () => {
  const alerts = evaluateUsageAlerts({
    summary: {
      "search:tavily": {
        service: "search",
        provider: "tavily",
        failureRate: 0.1,
        averageLatencyMs: 1000,
      },
    },
    quotas: [{ service: "search", provider: "tavily", utilization: 0.5 }],
  });
  assert.deepEqual(alerts, []);
});

test("detects failure rate and latency alerts", () => {
  const alerts = evaluateUsageAlerts({
    summary: {
      "search:tavily": {
        service: "search",
        provider: "tavily",
        failureRate: 0.4,
        averageLatencyMs: 6000,
      },
    },
  });
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts.map(alert => alert.type), ["failure_rate", "latency"]);
});

test("detects free quota utilization alerts", () => {
  const alerts = evaluateUsageAlerts({
    quotas: [
      {
        service: "search",
        provider: "tavily",
        utilization: 0.9,
      },
    ],
  });
  assert.deepEqual(alerts, [
    {
      type: "quota_utilization",
      service: "search",
      provider: "tavily",
      value: 0.9,
      threshold: MONITORING_DEFAULTS.quotaUtilizationThreshold,
    },
  ]);
});

test("supports threshold overrides through environment variables", () => {
  const previousFailure = process.env.USAGE_ALERT_FAILURE_RATE;
  const previousLatency = process.env.USAGE_ALERT_LATENCY_MS;
  const previousQuota = process.env.USAGE_ALERT_QUOTA_UTILIZATION;
  try {
    process.env.USAGE_ALERT_FAILURE_RATE = "0.5";
    process.env.USAGE_ALERT_LATENCY_MS = "10000";
    process.env.USAGE_ALERT_QUOTA_UTILIZATION = "0.95";

    const alerts = evaluateUsageAlerts({
      summary: {
        "search:tavily": {
          service: "search",
          provider: "tavily",
          failureRate: 0.4,
          averageLatencyMs: 9000,
        },
      },
      quotas: [{ service: "search", provider: "tavily", utilization: 0.9 }],
    });
    assert.deepEqual(alerts, []);
  } finally {
    if (previousFailure === undefined) delete process.env.USAGE_ALERT_FAILURE_RATE;
    else process.env.USAGE_ALERT_FAILURE_RATE = previousFailure;
    if (previousLatency === undefined) delete process.env.USAGE_ALERT_LATENCY_MS;
    else process.env.USAGE_ALERT_LATENCY_MS = previousLatency;
    if (previousQuota === undefined) delete process.env.USAGE_ALERT_QUOTA_UTILIZATION;
    else process.env.USAGE_ALERT_QUOTA_UTILIZATION = previousQuota;
  }
});
