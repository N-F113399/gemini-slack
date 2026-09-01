import { createSearchQuery } from "./searchModels.js";
import { SearchProviderError, SEARCH_ERROR_CODES } from "./searchErrors.js";
import { usageTracker as defaultUsageTracker } from "../usage/usageTracker.js";
import { calculateUsageCost } from "../usage/costCalculator.js";

const DEFAULT_MAX_QUERY_LENGTH = 500;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_PROVIDER_ATTEMPTS = 3;
const DEFAULT_MAX_DOMAINS = 5;

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function validateSearchLimits(query) {
  const maxQueryLength = readPositiveInt("SEARCH_MAX_QUERY_LENGTH", DEFAULT_MAX_QUERY_LENGTH);
  const maxResults = readPositiveInt("SEARCH_MAX_RESULTS", DEFAULT_MAX_RESULTS);
  const maxDomains = readPositiveInt("SEARCH_MAX_DOMAINS", DEFAULT_MAX_DOMAINS);

  if (query.text.length > maxQueryLength) {
    throw new SearchProviderError(SEARCH_ERROR_CODES.INVALID_REQUEST, `Search query exceeds the ${maxQueryLength} character limit`);
  }
  if (query.maxResults > maxResults) {
    throw new SearchProviderError(SEARCH_ERROR_CODES.INVALID_REQUEST, `Search result limit exceeds the maximum of ${maxResults}`);
  }
  if (query.domains.length > maxDomains) {
    throw new SearchProviderError(SEARCH_ERROR_CODES.INVALID_REQUEST, `Search domain limit exceeds the maximum of ${maxDomains}`);
  }
}

function providerName(provider) {
  return provider?.name || "unknown";
}

export class SearchService {
  constructor({ providers = [], usageTracker = defaultUsageTracker } = {}) {
    if (!Array.isArray(providers) || providers.length === 0) throw new TypeError("At least one search provider is required");
    if (!usageTracker || typeof usageTracker.record !== "function") throw new TypeError("usageTracker.record must be a function");
    this.providers = Object.freeze([...providers]);
    this.usageTracker = usageTracker;
  }

  async search(queryInput) {
    const query = createSearchQuery(queryInput);
    validateSearchLimits(query);
    const maxProviderAttempts = Math.min(this.providers.length, readPositiveInt("SEARCH_MAX_PROVIDER_ATTEMPTS", DEFAULT_MAX_PROVIDER_ATTEMPTS));
    let lastError = null;
    let attempts = 0;

    for (const provider of this.providers) {
      if (attempts >= maxProviderAttempts) break;
      attempts += 1;
      const startedAt = Date.now();
      const name = providerName(provider);
      try {
        const response = await provider.search(query);
        const latencyMs = Date.now() - startedAt;
        const credits = response?.usage?.credits;
        const requests = response?.usage?.requests ?? 1;
        const resultCount = response?.results?.length ?? 0;
        const cost = calculateUsageCost({ provider: name, service: "search", credits, requests, resultCount });
        this.usageTracker.record({
          provider: name,
          service: "search",
          operation: "search",
          success: true,
          latencyMs,
          credits,
          requests,
          estimatedCostUsd: cost,
          metadata: { requestId: response?.provider?.requestId ?? null, resultCount },
        });
        return response;
      } catch (error) {
        lastError = error;
        const latencyMs = Date.now() - startedAt;
        this.usageTracker.record({
          provider: name,
          service: "search",
          operation: "search",
          success: false,
          latencyMs,
          requests: 1,
          estimatedCostUsd: calculateUsageCost({ provider: name, service: "search", requests: 1 }),
          metadata: {
            errorCode: error?.code || null,
            status: error?.status || null,
            retryable: error?.retryable ?? false,
            quotaRelated: error?.quotaRelated ?? false,
          },
        });
        if (error instanceof SearchProviderError) {
          if (error.quotaRelated || error.retryable) continue;
          throw error;
        }
        throw error;
      }
    }
    if (lastError) throw lastError;
    throw new SearchProviderError(SEARCH_ERROR_CODES.UNAVAILABLE, "No search provider is available");
  }
}
