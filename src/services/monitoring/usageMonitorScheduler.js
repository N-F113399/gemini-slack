import logger from "../../utils/logger.js";
import { getUsageReport } from "../usage/usageReportService.js";
import { getFreeQuotaReport } from "../usage/freeQuotaReportService.js";
import { evaluateUsageAlerts } from "./usageMonitor.js";
import { notifyUsageAlerts } from "./alertNotifier.js";

const DEFAULT_INTERVAL_MS = 300_000;

function readIntervalMs() {
  const value = Number(process.env.USAGE_MONITOR_INTERVAL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

export class UsageMonitorScheduler {
  constructor({ getReport = getUsageReport, getQuotaReport = getFreeQuotaReport, evaluate = evaluateUsageAlerts, notify = notifyUsageAlerts } = {}) {
    this.getReport = getReport;
    this.getQuotaReport = getQuotaReport;
    this.evaluate = evaluate;
    this.notify = notify;
    this.timer = null;
    this.running = false;
  }

  async runOnce(now = new Date()) {
    if (this.running) return { skipped: true, alerts: 0 };
    this.running = true;
    try {
      const [report, quotaReport] = await Promise.all([
        this.getReport({ to: now }),
        this.getQuotaReport({ now }),
      ]);
      const alerts = this.evaluate({ summary: report.byProvider, quotas: quotaReport.quotas });
      if (alerts.length > 0) await this.notify(alerts);
      return { skipped: false, alerts: alerts.length };
    } catch (error) {
      logger.error(`Usage monitor run failed: ${error.message}`);
      return { skipped: false, alerts: 0, error };
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.timer) return false;
    const intervalMs = readIntervalMs();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
    return true;
  }

  stop() {
    if (!this.timer) return false;
    clearInterval(this.timer);
    this.timer = null;
    return true;
  }
}

export const usageMonitorScheduler = new UsageMonitorScheduler();
