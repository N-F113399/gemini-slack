import { SearchProviderError, SEARCH_ERROR_CODES } from "./searchErrors.js";

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_PROVIDER_ORDER = ["tavily", "exa", "you"];

function isEnabled(providerName) {
  const envName = `SEARCH_${providerName.toUpperCase()}_ENABLED`;
  const value = process.env[envName];
  return value === undefined || !["false", "0", "off"].includes(value.toLowerCase());
}

function getCooldownMs() {
  const value = Number(process.env.SEARCH_PROVIDER_COOLDOWN_MS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_COOLDOWN_MS;
}

export class SearchRouter {
  constructor({ providers = [], clock = () => Date.now() } = {}) {
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new TypeError("At least one search provider is required");
    }
    this.clock = clock;
    this.providers = Object.freeze([...providers]);
    this.state = new Map(this.providers.map((provider) => [provider.name, {
      failureCount: 0,
      cooldownUntil: 0,
      lastError: null,
    }]));
  }

  getAvailableProviders() {
    const now = this.clock();
    return this.providers.filter((provider) => {
      if (!isEnabled(provider.name)) return false;
      const state = this.state.get(provider.name);
      return !state || state.cooldownUntil <= now;
    });
  }

  getProviderState(name) {
    return this.state.get(name) || null;
  }

  async search(query) {
    const candidates = this.getAvailableProviders();
    let lastError = null;

    for (const provider of candidates) {
      try {
        const response = await provider.search(query);
        this.recordSuccess(provider.name);
        return response;
      } catch (error) {
        lastError = error;
        this.recordFailure(provider.name, error);

        if (!this.shouldFallback(error)) {
          throw error;
        }
      }
    }

    if (lastError) throw lastError;
    throw new SearchProviderError(
      SEARCH_ERROR_CODES.UNAVAILABLE,
      "No enabled search provider is currently available",
      {
        retryable: true,
      },
    );
  }

  shouldFallback(error) {
    return error instanceof SearchProviderError
      && (error.retryable || error.quotaRelated || error.code === SEARCH_ERROR_CODES.AUTHENTICATION);
  }

  recordSuccess(providerName) {
    const state = this.state.get(providerName);
    if (!state) return;
    state.failureCount = 0;
    state.cooldownUntil = 0;
    state.lastError = null;
  }

  recordFailure(providerName, error) {
    const state = this.state.get(providerName);
    if (!state) return;

    state.lastError = error;
    state.failureCount += 1;

    if (error instanceof SearchProviderError && (error.quotaRelated || error.retryable)) {
      state.cooldownUntil = this.clock() + getCooldownMs();
    }
  }
}

export function createDefaultSearchRouter({ providers = [] } = {}) {
  const order = process.env.SEARCH_PROVIDER_ORDER
    ? process.env.SEARCH_PROVIDER_ORDER.split(",").map((name) => name.trim()).filter(Boolean)
    : DEFAULT_PROVIDER_ORDER;

  const providerMap = new Map(providers.map((provider) => [provider.name, provider]));
  const ordered = order.map((name) => providerMap.get(name)).filter(Boolean);

  return new SearchRouter({
    providers: ordered.length > 0 ? ordered : providers,
  });
}
