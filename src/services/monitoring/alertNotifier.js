import logger from "../../utils/logger.js";

export function formatUsageAlert(alert) {
  const typeLabel = {
    failure_rate: "Failure rate",
    latency: "Latency",
    quota_utilization: "Free quota utilization",
  }[alert?.type] || alert?.type || "Usage alert";

  const value = alert?.type === "quota_utilization" || alert?.type === "failure_rate"
    ? `${((Number(alert.value) || 0) * 100).toFixed(1)}%`
    : `${Math.round(Number(alert.value) || 0)}ms`;
  const threshold = alert?.type === "quota_utilization" || alert?.type === "failure_rate"
    ? `${((Number(alert.threshold) || 0) * 100).toFixed(1)}%`
    : `${Math.round(Number(alert.threshold) || 0)}ms`;

  return `⚠️ ${typeLabel}: ${alert.service}/${alert.provider} is ${value} (threshold: ${threshold})`;
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
