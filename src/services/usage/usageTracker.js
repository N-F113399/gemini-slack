const DEFAULT_MAX_EVENTS = 10_000;

function readMaxEvents() {
  const value = Number(process.env.USAGE_TRACKER_MAX_EVENTS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_EVENTS;
}

function normalizeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export class UsageTracker {
  constructor({ maxEvents = readMaxEvents() } = {}) {
    if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
      throw new TypeError("maxEvents must be a positive integer");
    }
    this.maxEvents = maxEvents;
    this.events = [];
  }

  record({
    provider,
    service,
    operation = "request",
    success = true,
    latencyMs = null,
    inputTokens = null,
    outputTokens = null,
    totalTokens = null,
    credits = null,
    requests = null,
    estimatedCostUsd = null,
    metadata = {},
  } = {}) {
    if (!provider) throw new TypeError("provider is required");
    if (!service) throw new TypeError("service is required");

    const event = Object.freeze({
      timestamp: new Date().toISOString(),
      provider,
      service,
      operation,
      success: Boolean(success),
      latencyMs: normalizeNumber(latencyMs),
      tokens: Object.freeze({
        input: normalizeNumber(inputTokens),
        output: normalizeNumber(outputTokens),
        total: normalizeNumber(totalTokens),
      }),
      search: Object.freeze({
        credits: normalizeNumber(credits),
        requests: normalizeNumber(requests),
      }),
      estimatedCostUsd: normalizeNumber(estimatedCostUsd),
      metadata: Object.freeze({ ...metadata }),
    });

    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
    return event;
  }

  list({ provider = null, service = null } = {}) {
    return this.events.filter(event => {
      if (provider && event.provider !== provider) return false;
      if (service && event.service !== service) return false;
      return true;
    });
  }

  summarize() {
    const summary = {};
    for (const event of this.events) {
      const key = `${event.service}:${event.provider}`;
      if (!summary[key]) {
        summary[key] = {
          service: event.service,
          provider: event.provider,
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
      const item = summary[key];
      item.requests += 1;
      if (!event.success) item.failures += 1;
      item.inputTokens += event.tokens.input || 0;
      item.outputTokens += event.tokens.output || 0;
      item.totalTokens += event.tokens.total || 0;
      item.credits += event.search.credits || 0;
      item.searchRequests += event.search.requests || 0;
      item.estimatedCostUsd += event.estimatedCostUsd || 0;
      if (event.latencyMs !== null) {
        item.latencyMsTotal += event.latencyMs;
        item.latencySamples += 1;
      }
    }

    for (const item of Object.values(summary)) {
      item.averageLatencyMs = item.latencySamples > 0
        ? item.latencyMsTotal / item.latencySamples
        : null;
      delete item.latencyMsTotal;
      delete item.latencySamples;
    }
    return summary;
  }

  clear() {
    this.events.length = 0;
  }
}

export const usageTracker = new UsageTracker();
