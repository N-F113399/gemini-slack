export const SEARCH_ERROR_CODES = Object.freeze({
  AUTHENTICATION: "SEARCH_AUTHENTICATION_ERROR",
  FORBIDDEN: "SEARCH_FORBIDDEN",
  PAYMENT_REQUIRED: "SEARCH_PAYMENT_REQUIRED",
  QUOTA_EXCEEDED: "SEARCH_QUOTA_EXCEEDED",
  INVALID_REQUEST: "SEARCH_INVALID_REQUEST",
  PROVIDER_ERROR: "SEARCH_PROVIDER_ERROR",
  TIMEOUT: "SEARCH_TIMEOUT",
  INVALID_RESPONSE: "SEARCH_INVALID_RESPONSE",
  UNAVAILABLE: "SEARCH_UNAVAILABLE",
});

const DEFAULT_RETRYABLE = new Set([
  SEARCH_ERROR_CODES.PROVIDER_ERROR,
  SEARCH_ERROR_CODES.TIMEOUT,
  SEARCH_ERROR_CODES.UNAVAILABLE,
]);

export class SearchProviderError extends Error {
  constructor(code, message, {
    provider = null,
    status = null,
    retryable = DEFAULT_RETRYABLE.has(code),
    quotaRelated = code === SEARCH_ERROR_CODES.QUOTA_EXCEEDED,
    cause = null,
    details = {},
  } = {}) {
    super(message);
    this.name = "SearchProviderError";
    this.code = code;
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    this.quotaRelated = quotaRelated;
    this.cause = cause;
    this.details = details;
  }
}

export function mapHttpStatusToSearchError(status, provider) {
  switch (status) {
    case 401:
      return new SearchProviderError(SEARCH_ERROR_CODES.AUTHENTICATION, "Search provider authentication failed", { provider, status });
    case 402:
      return new SearchProviderError(SEARCH_ERROR_CODES.PAYMENT_REQUIRED, "Search provider payment or credit requirement was reached", { provider, status, quotaRelated: true, retryable: false });
    case 403:
      return new SearchProviderError(SEARCH_ERROR_CODES.FORBIDDEN, "Search provider access was forbidden", { provider, status });
    case 422:
      return new SearchProviderError(SEARCH_ERROR_CODES.INVALID_REQUEST, "Search request was rejected as invalid", { provider, status });
    case 429:
      return new SearchProviderError(SEARCH_ERROR_CODES.QUOTA_EXCEEDED, "Search provider rate or quota limit was reached", { provider, status, retryable: false, quotaRelated: true });
    default:
      if (status >= 500) {
        return new SearchProviderError(SEARCH_ERROR_CODES.PROVIDER_ERROR, `Search provider returned HTTP ${status}`, { provider, status, retryable: true });
      }
      return new SearchProviderError(SEARCH_ERROR_CODES.PROVIDER_ERROR, `Search provider returned HTTP ${status}`, { provider, status });
  }
}
