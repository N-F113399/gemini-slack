import supabase from "../db.js";

function normalizeDate(value, name) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid usage report ${name} date`);
  return date;
}

function normalizeRange({ from = null, to = null } = {}) {
  const end = normalizeDate(to, "to") || new Date();
  const start = normalizeDate(from, "from") || new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (start > end) throw new RangeError("Usage report start must not be after end");
  return { start, end };
}

function aggregate(rows) {
  const result = {};
  for (const row of rows) {
    const key = `${row.service}:${row.provider}`;
    if (!result[key]) {
      result[key] = {
        service: row.service,
        provider: row.provider,
        requests: 0,
        failures: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        credits: 0,
        searchRequests: 0,
        latencyMsTotal: 0,
        latencySamples: 0,
      };
    }
    const item = result[key];
    item.requests += 1;
    if (!row.success) item.failures += 1;
    item.inputTokens += Number(row.input_tokens) || 0;
    item.outputTokens += Number(row.output_tokens) || 0;
    item.totalTokens += Number(row.total_tokens) || 0;
    item.credits += Number(row.credits) || 0;
    item.searchRequests += Number(row.request_count) || 0;
    if (row.latency_ms !== null && row.latency_ms !== undefined) {
      item.latencyMsTotal += Number(row.latency_ms) || 0;
      item.latencySamples += 1;
    }
  }

  for (const item of Object.values(result)) {
    item.failureRate = item.requests > 0 ? item.failures / item.requests : 0;
    item.averageLatencyMs = item.latencySamples > 0 ? item.latencyMsTotal / item.latencySamples : null;
    delete item.latencyMsTotal;
    delete item.latencySamples;
  }
  return result;
}

export async function getUsageReport({ from = null, to = null } = {}) {
  const range = normalizeRange({ from, to });
  const { data, error } = await supabase
    .from("usage_events")
    .select("occurred_at,provider,service,operation,success,latency_ms,input_tokens,output_tokens,total_tokens,credits,request_count")
    .gte("occurred_at", range.start.toISOString())
    .lte("occurred_at", range.end.toISOString())
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  const rows = data || [];
  const byProvider = aggregate(rows);
  const totals = Object.values(byProvider).reduce((acc, item) => {
    acc.requests += item.requests;
    acc.failures += item.failures;
    acc.inputTokens += item.inputTokens;
    acc.outputTokens += item.outputTokens;
    acc.totalTokens += item.totalTokens;
    acc.credits += item.credits;
    acc.searchRequests += item.searchRequests;
    return acc;
  }, { requests: 0, failures: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, credits: 0, searchRequests: 0 });

  totals.failureRate = totals.requests > 0 ? totals.failures / totals.requests : 0;

  return {
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    eventCount: rows.length,
    totals,
    byProvider,
  };
}
