import supabase from "../db.js";
import { getFreeQuota, listFreeQuotas } from "./freeQuotaConfig.js";

export function periodStart(period, now = new Date()) {
  const value = new Date(now);
  if (period === "day") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (period === "month") return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  if (period === "week") {
    const day = value.getUTCDay();
    value.setUTCDate(value.getUTCDate() - day);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  throw new TypeError(`Unsupported quota period: ${period}`);
}

function usageForQuota(row, quota) {
  if (quota.unit === "credits") return Number(row.credits) || 0;
  if (quota.unit === "requests") return Number(row.request_count) || 0;
  if (quota.unit === "input_tokens") return Number(row.input_tokens) || 0;
  if (quota.unit === "output_tokens") return Number(row.output_tokens) || 0;
  if (quota.unit === "tokens") return Number(row.total_tokens) || 0;
  return 0;
}

export async function getFreeQuotaReport({ now = new Date(), quotaConfig = null } = {}) {
  const quotas = quotaConfig ? listFreeQuotas(quotaConfig) : [
    getFreeQuota({ provider: "tavily", service: "search" }),
    getFreeQuota({ provider: "you", service: "search" }),
  ].filter(Boolean);

  if (quotas.length === 0) return { generatedAt: now.toISOString(), quotas: [] };

  const starts = quotas.map(quota => periodStart(quota.period, now));
  const earliest = new Date(Math.min(...starts.map(date => date.getTime())));
  const { data, error } = await supabase
    .from("usage_events")
    .select("occurred_at,provider,service,success,input_tokens,output_tokens,total_tokens,credits,request_count")
    .gte("occurred_at", earliest.toISOString())
    .lte("occurred_at", now.toISOString());

  if (error) throw error;

  const rows = data || [];
  return {
    generatedAt: now.toISOString(),
    quotas: quotas.map(quota => {
      const start = periodStart(quota.period, now);
      const matching = rows.filter(row => row.provider === quota.provider && row.service === quota.service && new Date(row.occurred_at) >= start);
      const used = matching.reduce((sum, row) => sum + usageForQuota(row, quota), 0);
      const remaining = Math.max(quota.limit - used, 0);
      const next = new Date(start);
      if (quota.period === "day") next.setUTCDate(next.getUTCDate() + 1);
      else if (quota.period === "week") next.setUTCDate(next.getUTCDate() + 7);
      else if (quota.period === "month") next.setUTCMonth(next.getUTCMonth() + 1);
      return {
        provider: quota.provider,
        service: quota.service,
        period: quota.period,
        unit: quota.unit,
        limit: quota.limit,
        used,
        remaining,
        utilization: quota.limit > 0 ? used / quota.limit : null,
        resetAt: next.toISOString(),
        source: quota.source,
      };
    }),
  };
}
