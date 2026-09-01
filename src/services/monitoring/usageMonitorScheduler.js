import logger from "../../utils/logger.js";

const DEFAULT_INTERVAL_MS = 300_000;

function readIntervalMs() {
  const value = Number(process.env.USAGE_MONITOR_INTERVAL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

async function defaultGetReport(options) {
  const { getUsageReport } = await import("../usage/usageReportService.js");
  return getUsageReport(options);
}

async function defaultGetQuotaReport(options) {
  const { getFreeQuotaReport } = await import("../usage/freeQuotaReportService.js");
  return getFreeQuotaReport(options);
}

async function defaultGetQualityReport(options) {
  const { getSearchQualityReport } = await import("../usage/searchQualityReportService.js");
  return getSearchQualityReport(options);
}

async function defaultEvaluate(options) {
  const { evaluateUsageAlerts } = await import("./usageMonitor.js");
  return evaluateUsageAlerts(options);
}

async function defaultEvaluateQuality(options) {
  const { evaluateSearchQualityAlerts } = await import("./searchQualityMonitor.js");
  return evaluateSearchQualityAlerts(options);
}

async function defaultNotify(alerts) {
  const { notifyUsageAlerts } = await import("./alertNotifier.js");
  return notifyUsageAlerts(alerts);
}

export class UsageMonitorScheduler {
  constructor({
    getReport,
    getQuotaReport,
    getQualityReport,
    evaluate,
    evaluateQuality,
    notify,
  } = {}) {
    this.getReport = getReport ?? defaultGetReport;
    this.getQuotaReport = getQuotaReport ?? defaultGetQuotaReport;
    this.getQualityReport = getQualityReport ?? defaultGetQualityReport;
    this.evaluate = evaluate ?? defaultEvaluate;
    this.evaluateQuality = evaluateQuality ?? defaultEvaluateQuality;
    this.notify = notify ?? defaultNotify;
    this.timer = null;
    this.running = false;
  }

  async runOnce(now = new Date()) {
    if (this.running) return { skipped: true, alerts: 0 };
    this.running = true;
    try {
      const [report, quotaReport, qualityReport] = await Promise.all([
        this.getReport({ to: now }),
        this.getQuotaReport({ now }),
        this.getQualityReport({ to: now }),
      ]);
      const alerts = await this.evaluate({ summary: report.byProvider, quotas: quotaReport.quotas });
      const qualityAlerts = await this.evaluateQuality({ report: qualityReport });
      const allAlerts = [...alerts, ...qualityAlerts];
      if (allAlerts.length > 0) await this.notify(allAlerts);
      return { skipped: false, alerts: allAlerts.length };
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
