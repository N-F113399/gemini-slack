const DEFAULT_RETENTION_DAYS = 90;

export function getUsageRetentionDays() {
  const value = Number(process.env.USAGE_RETENTION_DAYS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_RETENTION_DAYS;
}

export function retentionCutoff(now = new Date(), retentionDays = getUsageRetentionDays()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("now must be a valid Date");
  }
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    throw new TypeError("retentionDays must be a positive integer");
  }
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
}

async function defaultStore() {
  const module = await import("../db.js");
  return module.default;
}

export async function deleteExpiredUsageEvents({ now = new Date(), retentionDays = getUsageRetentionDays(), store = null } = {}) {
  const cutoff = retentionCutoff(now, retentionDays);
  const db = store || await defaultStore();
  const { data, error } = await db
    .from("usage_events")
    .delete()
    .lt("occurred_at", cutoff.toISOString())
    .select("id");

  if (error) throw error;
  return {
    cutoff: cutoff.toISOString(),
    deletedCount: Array.isArray(data) ? data.length : 0,
  };
}
