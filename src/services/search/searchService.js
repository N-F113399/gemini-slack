import { createSearchQuery } from "./searchModels.js";
import { SearchProviderError } from "./searchErrors.js";

export class SearchService {
  constructor({ providers = [] } = {}) {
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new TypeError("At least one search provider is required");
    }
    this.providers = Object.freeze([...providers]);
  }

  async search(queryInput) {
    const query = createSearchQuery(queryInput);
    let lastError = null;

    for (const provider of this.providers) {
      try {
        return await provider.search(query);
      } catch (error) {
        lastError = error;
        if (!(error instanceof SearchProviderError) || !error.retryable) {
          if (error instanceof SearchProviderError && error.quotaRelated) continue;
          throw error;
        }
      }
    }

    if (lastError) throw lastError;
    throw new SearchProviderError("SEARCH_UNAVAILABLE", "No search provider is available");
  }
}
