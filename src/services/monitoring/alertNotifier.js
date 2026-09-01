import logger from "../../utils/logger.js";

const TYPE_LABELS = {
  failure_rate: "Failure rate",
  latency: "Latency",
  quota_utilization: "Free quota utilization",
  quality_score: "Search quality score",
  invalid_citation_rate: "Invalid citation rate",
  conflict_rate: "Source conflict rate",
};

function formatPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

export function formatUsageAlert(alert) {
  const typeLabel = TYPE_LABELS[alert?.type] || alert?.type || "Usage alert";
  const percentageType = new Set([
    "quota_utilization",
    "failure_rate",
    "quality_score",
    "invalid_citation_rate",
    "conflict_rate",
  ]).has(alert?.type);

  const value = percentageType
    ? formatPercent(alert?.value)
    : `${Math.round(Number(alert?.value) || 0)}ms`;
  const threshold = percentageType
    ? formatPercent(alert?.threshold)
    : `${Math.round(Number(alert?.threshold) || 0)}ms`;

  return `⚠️ ${typeLabel}: ${alert?.service}/${alert?.provider} is ${value} (threshold: ${threshold})`;
}

export async function notifyUsageAlerts(alerts, { send = null, sender = null } = {}) {
  if (!Array.isArray(alerts) || alerts.length === 0) return { sent: 0 };
  const sendFn = send || sender || (async message => logger.warn(message));
  let sent = 0;
  for (const alert of alerts) {
    await sendFn(formatUsageAlert(alert), alert);
    sent += 1;
  }
  return { sent };
}
