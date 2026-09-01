import supabase from "../db.js";
import logger from "../../utils/logger.js";

export async function saveUsageEvent(event) {
  if (!event || typeof event !== "object") {
    throw new TypeError("Usage event is required");
  }

  const row = {
    occurred_at: event.timestamp || new Date().toISOString(),
    provider: event.provider,
    service: event.service,
    operation: event.operation || "request",
    success: Boolean(event.success),
    latency_ms: event.latencyMs ?? null,
    input_tokens: event.tokens?.input ?? null,
    output_tokens: event.tokens?.output ?? null,
    total_tokens: event.tokens?.total ?? null,
    credits: event.search?.credits ?? null,
    request_count: event.search?.requests ?? null,
    estimated_cost_usd: event.estimatedCostUsd ?? null,
    error_code: event.metadata?.errorCode ?? null,
    http_status: event.metadata?.status ?? null,
    retryable: event.metadata?.retryable ?? null,
    quota_related: event.metadata?.quotaRelated ?? null,
    metadata: event.metadata || {},
  };

  const { data, error } = await supabase
    .from("usage_events")
    .insert([row])
    .select()
    .single();

  if (error) {
    logger.error(`Supabase usage event insert error: ${error.message}`);
    throw error;
  }

  return data;
}
