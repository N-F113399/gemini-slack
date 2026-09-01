import fetch from "node-fetch";
import { SearchProvider } from "../searchProvider.js";
import {
  SEARCH_PROVIDER_CAPABILITIES,
  SEARCH_PROVIDER_NAMES,
  SEARCH_QUOTA_TYPES,
  SEARCH_RESULT_TYPES,
  createSearchResult,
  createSearchResponse,
} from "../searchModels.js";
import { SEARCH_ERROR_CODES, SearchProviderError } from "../searchErrors.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const API_URL = "https://ydc-index.io/v1/search";

function getTimeoutMs() {
  const value = Number(process.env.YOU_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function createProviderError(code, message, status = null, cause = null) {
  return new SearchProviderError(code, message, {
    provider: SEARCH_PROVIDER_NAMES.YOU,
    status,
    retryable: code === SEARCH_ERROR_CODES.PROVIDER_ERROR
      || code === SEARCH_ERROR_CODES.TIMEOUT
      || code === SEARCH_ERROR_CODES.UNAVAILABLE,
    quotaRelated: code === SEARCH_ERROR_CODES.PAYMENT_REQUIRED
      || code === SEARCH_ERROR_CODES.QUOTA_EXCEEDED,
    cause,
  });
}

function mapStatus(status) {
  switch (status) {
    case 401: return SEARCH_ERROR_CODES.AUTHENTICATION;
    case 402: return SEARCH_ERROR_CODES.PAYMENT_REQUIRED;
    case 403: return SEARCH_ERROR_CODES.FORBIDDEN;
    case 422: return SEARCH_ERROR_CODES.INVALID_REQUEST;
    case 429: return SEARCH_ERROR_CODES.QUOTA_EXCEEDED;
    default:
      return status >= 500
        ? SEARCH_ERROR_CODES.PROVIDER_ERROR
        : SEARCH_ERROR_CODES.PROVIDER_ERROR;
  }
}

function toQueryParams(query) {
  const params = new URLSearchParams();
  params.set("query", query.text);
  params.set("count", String(query.maxResults));

  if (query.language) params.set("language", query.language);
  if (query.region) params.set("country", query.region);
  if (query.domains?.length) {
    for (const domain of query.domains) params.append("domain", domain);
  }

  return params;
}

function normalizeWebResult(result, index) {
  return createSearchResult({
    id: result.url || `you:web:${index}`,
    source: {
      type: SEARCH_RESULT_TYPES.WEB,
      provider: SEARCH_PROVIDER_NAMES.YOU,
      url: result.url,
      title: result.title,
      domain: result.url ? new URL(result.url).hostname : null,
    },
    ranking: { position: index + 1 },
    evidence: {
      description: result.description || null,
      snippets: Array.isArray(result.snippets) ? result.snippets : [],
    },
    media: {
      thumbnailUrl: result.thumbnail_url || null,
      faviconUrl: result.favicon_url || null,
    },
  });
}

function normalizeNewsResult(result, index) {
  return createSearchResult({
    id: result.url || `you:news:${index}`,
    source: {
      type: SEARCH_RESULT_TYPES.NEWS,
      provider: SEARCH_PROVIDER_NAMES.YOU,
      url: result.url,
      title: result.title,
      domain: result.url ? new URL(result.url).hostname : null,
    },
    ranking: { position: index + 1 },
    evidence: {
      description: result.description || null,
    },
    publication: {
      publishedAt: result.page_age || null,
    },
    media: {
      thumbnailUrl: result.thumbnail_url || null,
    },
  });
}

function parseJsonResponse(data, query, startedAt) {
  const web = Array.isArray(data?.results?.web) ? data.results.web : [];
  const news = Array.isArray(data?.results?.news) ? data.results.news : [];
  const results = [
    ...web.map(normalizeWebResult),
    ...news.map(normalizeNewsResult),
  ];

  return createSearchResponse({
    query,
    provider: {
      name: SEARCH_PROVIDER_NAMES.YOU,
      requestId: data?.metadata?.search_uuid || null,
      latencyMs: typeof data?.metadata?.latency === "number"
        ? Math.round(data.metadata.latency * 1000)
        : Date.now() - startedAt,
    },
    results,
    usage: {
      quotaType: SEARCH_QUOTA_TYPES.DAILY_REQUEST,
      providerSpecific: {
        searchUuid: data?.metadata?.search_uuid || null,
      },
    },
    metadata: {
      resultCounts: { web: web.length, news: news.length },
    },
    raw: data,
  });
}

export class YouSearchProvider extends SearchProvider {
  constructor({ fetchImpl = fetch } = {}) {
    super({
      name: SEARCH_PROVIDER_NAMES.YOU,
      capabilities: SEARCH_PROVIDER_CAPABILITIES[SEARCH_PROVIDER_NAMES.YOU],
    });
    this.fetchImpl = fetchImpl;
  }

  async search(query) {
    const apiKey = process.env.YDC_API_KEY;
    if (!apiKey) {
      throw createProviderError(
        SEARCH_ERROR_CODES.AUTHENTICATION,
        "YDC_API_KEY is not configured",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
    const startedAt = Date.now();

    let response;
    let data;
    try {
      const params = toQueryParams(query);
      response = await this.fetchImpl(`${API_URL}?${params.toString()}`, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }
    } catch (error) {
      const code = error?.name === "AbortError"
        ? SEARCH_ERROR_CODES.TIMEOUT
        : SEARCH_ERROR_CODES.UNAVAILABLE;
      throw createProviderError(
        code,
        error?.name === "AbortError" ? "You.com request timed out" : error.message,
        null,
        error,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const code = mapStatus(response.status);
      throw createProviderError(
        code,
        data?.message || data?.error || `You.com request failed with status ${response.status}`,
        response.status,
      );
    }

    if (!data?.results || (!Array.isArray(data.results.web) && !Array.isArray(data.results.news))) {
      throw createProviderError(
        SEARCH_ERROR_CODES.INVALID_RESPONSE,
        "You.com response does not contain web or news results",
        response.status,
      );
    }

    return parseJsonResponse(data, query, startedAt);
  }
}

export const youSearchProvider = new YouSearchProvider();
