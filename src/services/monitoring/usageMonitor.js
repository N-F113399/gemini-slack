const DEFAULT_FAILURE_RATE_THRESHOLD = 0.3;
const DEFAULT_LATENCY_THRESHOLD_MS = 5000;
const DEFAULT_QUOTA_UTILIZATION_THRESHOLD = 0.8;

function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function evaluateUsageAlerts({ summary = {}, quotas = [] } = {}) {
  const failureRateThreshold = readNumber("USAGE_ALERT_FAILURE_RATE", DEFAULT_FAILURE_RATE_THRESHOLD);
  const latencyThresholdMs = readNumber("USAGE_ALERT_LATENCY_MS", DEFAULT_LATENCY_THRESHOLD_MS);
  const quotaThreshold = readNumber("USAGE_ALERT_QUOTA_UTILIZATION", DEFAULT_QUOTA_UTILIZATION_THRESHOLD);
  const alerts = [];

  for (const item of Object.values(summary)) {
    const failureRate = Number(item.failureRate) || 0;
    const averageLatencyMs = Number(item.averageLatencyMs) || 0;
    if (failureRate >= failureRateThreshold) alerts.push({ type: "failure_rate", service: item.service, provider: item.provider, value: failureRate, threshold: failureRateThreshold });
    if (averageLatencyMs >= latencyThresholdMs) alerts.push({ type: "latency", service: item.service, provider: item.provider, value: averageLatencyMs, threshold: latencyThresholdMs });
  }

  for (const quota of quotas) {
    const utilization = Number(quota.utilization);
    if (Number.isFinite(utilization) && utilization >= quotaThreshold) {
      alerts.push({ type: "quota_utilization", service: quota.service, provider: quota.provider, value: utilization, threshold: quotaThreshold });
    }
  }

  return alerts;
}

export const MONITORING_DEFAULTS = Object.freeze({
  failureRateThreshold: DEFAULT_FAILURE_RATE_THRESHOLD,
  latencyThresholdMs: DEFAULT_LATENCY_THRESHOLD_MS,
  quotaUtilizationThreshold: DEFAULT_QUOTA_UTILIZATION_THRESHOLD,
});
