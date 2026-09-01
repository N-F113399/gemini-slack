import { createSearchQuery } from "./searchModels.js";
import { SearchProviderError, SEARCH_ERROR_CODES } from "./searchErrors.js";

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
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.INVALID_REQUEST,
      `Search query exceeds the ${maxQueryLength} character limit`,
    );
  }
  if (query.maxResults > maxResults) {
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.INVALID_REQUEST,
      `Search result limit exceeds the maximum of ${maxResults}`,
    );
  }
  if (query.domains.length > maxDomains) {
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.INVALID_REQUEST,
      `Search domain limit exceeds the maximum of ${maxDomains}`,
    );
  }
}

export class SearchService {
  constructor({ providers = [] } = {}) {
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new TypeError("At least one search provider is required");
    }
    this.providers = Object.freeze([...providers]);
  }

  async search(queryInput) {
    const query = createSearchQuery(queryInput);
    validateSearchLimits(query);

    const maxProviderAttempts = Math.min(
      this.providers.length,
      readPositiveInt("SEARCH_MAX_PROVIDER_ATTEMPTS", DEFAULT_MAX_PROVIDER_ATTEMPTS),
    );

    let lastError = null;
    let attempts = 0;

    for (const provider of this.providers) {
      if (attempts >= maxProviderAttempts) break;
      attempts += 1;

      try {
        return await provider.search(query);
      } catch (error) {
        lastError = error;
        if (error instanceof SearchProviderError) {
          if (error.quotaRelated || error.retryable) continue;
          throw error;
        }
        throw error;
      }
    }

    if (lastError) throw lastError;
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.UNAVAILABLE,
      "No search provider is available",
    );
  }
}
