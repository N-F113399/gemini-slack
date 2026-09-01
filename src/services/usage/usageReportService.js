import supabase from "../db.js";

function startOfDay(date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function normalizeRange({ from = null, to = null } = {}) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : startOfDay(end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new TypeError("Invalid usage report date range");
  }
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
        estimatedCostUsd: 0,
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
    item.estimatedCostUsd += Number(row.estimated_cost_usd) || 0;
    if (row.latency_ms !== null && row.latency_ms !== undefined) {
      item.latencyMsTotal += Number(row.latency_ms) || 0;
      item.latencySamples += 1;
    }
  }
  for (const item of Object.values(result)) {
    item.failureRate = item.requests ? item.failures / item.requests : 0;
    item.averageLatencyMs = item.latencySamples ? item.latencyMsTotal / item.latencySamples : null;
    delete item.latencyMsTotal;
    delete item.latencySamples;
  }
  return result;
}

export async function getUsageReport({ from = null, to = null } = {}) {
  const range = normalizeRange({ from, to });
  const { data, error } = await supabase
    .from("usage_events")
    .select("occurred_at,provider,service,success,latency_ms,input_tokens,output_tokens,total_tokens,credits,request_count,estimated_cost_usd")
    .gte("occurred_at", range.start.toISOString())
    .lte("occurred_at", range.end.toISOString())
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  const rows = data || [];
  const summary = aggregate(rows);
  return {
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    eventCount: rows.length,
    totals: Object.values(summary).reduce((acc, item) => {
      acc.requests += item.requests;
      acc.failures += item.failures;
      acc.inputTokens += item.inputTokens;
      acc.outputTokens += item.outputTokens;
      acc.totalTokens += item.totalTokens;
      acc.credits += item.credits;
      acc.searchRequests += item.searchRequests;
      acc.estimatedCostUsd += item.estimatedCostUsd;
      return acc;
    }, {
      requests: 0,
      failures: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      credits: 0,
      searchRequests: 0,
      estimatedCostUsd: 0,
    }),
    byProvider: summary,
  };
}
