import logger from "../../utils/logger.js";

const DEFAULT_INTERVAL_MS = 86_400_000;

function readIntervalMs() {
  const value = Number(process.env.USAGE_RETENTION_INTERVAL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

async function defaultCleanup(options) {
  const { deleteExpiredUsageEvents } = await import("./usageRetentionService.js");
  return deleteExpiredUsageEvents(options);
}

export class UsageRetentionScheduler {
  constructor({ cleanup = defaultCleanup } = {}) {
    this.cleanup = cleanup;
    this.timer = null;
    this.running = false;
  }

  async runOnce(now = new Date()) {
    if (this.running) return { skipped: true, deletedCount: 0 };
    this.running = true;
    try {
      const result = await this.cleanup({ now });
      return { skipped: false, ...result };
    } catch (error) {
      logger.error(`Usage retention cleanup failed: ${error.message}`);
      return { skipped: false, deletedCount: 0, error };
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.timer) return false;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, readIntervalMs());
    return true;
  }

  stop() {
    if (!this.timer) return false;
    clearInterval(this.timer);
    this.timer = null;
    return true;
  }
}

export const usageRetentionScheduler = new UsageRetentionScheduler();
