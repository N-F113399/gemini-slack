import fetch from "node-fetch";
import { SearchProvider } from "../searchProvider.js";
import {
  SEARCH_PROVIDER_CAPABILITIES,
  SEARCH_PROVIDER_NAMES,
  SEARCH_QUOTA_TYPES,
  createSearchResult,
  createSearchResponse,
} from "../searchModels.js";
import { SEARCH_ERROR_CODES, SearchProviderError } from "../searchErrors.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const API_URL = "https://api.exa.ai/search";

function getTimeoutMs() {
  const value = Number(process.env.EXA_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function createProviderError(code, message, status = null, cause = null, details = {}) {
  return new SearchProviderError(code, message, {
    provider: SEARCH_PROVIDER_NAMES.EXA,
    status,
    retryable: code === SEARCH_ERROR_CODES.PROVIDER_ERROR
      || code === SEARCH_ERROR_CODES.TIMEOUT
      || code === SEARCH_ERROR_CODES.UNAVAILABLE,
    quotaRelated: code === SEARCH_ERROR_CODES.QUOTA_EXCEEDED,
    cause,
    details,
  });
}

function mapStatus(status) {
  switch (status) {
    case 400:
      return SEARCH_ERROR_CODES.INVALID_REQUEST;
    case 401:
    case 403:
      return SEARCH_ERROR_CODES.AUTHENTICATION;
    case 402:
      return SEARCH_ERROR_CODES.PAYMENT_REQUIRED;
    case 429:
      return SEARCH_ERROR_CODES.QUOTA_EXCEEDED;
    default:
      return status >= 500 ? SEARCH_ERROR_CODES.PROVIDER_ERROR : SEARCH_ERROR_CODES.PROVIDER_ERROR;
  }
}

function toQueryPayload(query) {
  const payload = {
    query: query.text,
    numResults: query.maxResults,
    type: "auto",
    contents: {
      highlights: true,
      text: false,
    },
  };

  if (query.domains?.length) payload.includeDomains = query.domains;
  if (query.recency) {
    const now = new Date();
    const start = new Date(now);
    if (query.recency === "day") start.setUTCDate(start.getUTCDate() - 1);
    else if (query.recency === "week") start.setUTCDate(start.getUTCDate() - 7);
    else if (query.recency === "month") start.setUTCMonth(start.getUTCMonth() - 1);
    else if (query.recency === "year") start.setUTCFullYear(start.getUTCFullYear() - 1);
    payload.startPublishedDate = start.toISOString();
  }
  return payload;
}

function getErrorMessage(data, fallbackStatus) {
  return data?.error || data?.message || `Exa request failed with status ${fallbackStatus}`;
}

export class ExaSearchProvider extends SearchProvider {
  constructor({ fetchImpl = fetch } = {}) {
    super({
      name: SEARCH_PROVIDER_NAMES.EXA,
      capabilities: SEARCH_PROVIDER_CAPABILITIES[SEARCH_PROVIDER_NAMES.EXA],
    });
    this.fetchImpl = fetchImpl;
  }

  async search(query) {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      throw createProviderError(
        SEARCH_ERROR_CODES.AUTHENTICATION,
        "EXA_API_KEY is not configured",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
    const startedAt = Date.now();

    let response;
    let data;
    try {
      response = await this.fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toQueryPayload(query)),
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
        error?.name === "AbortError" ? "Exa request timed out" : error.message,
        null,
        error,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const code = mapStatus(response.status);
      throw createProviderError(code, getErrorMessage(data, response.status), response.status);
    }

    if (!Array.isArray(data?.results)) {
      throw createProviderError(
        SEARCH_ERROR_CODES.INVALID_RESPONSE,
        "Exa response does not contain a results array",
        response.status,
      );
    }

    const results = data.results.map((result, index) => createSearchResult({
      id: result.id || `${this.name}:${result.url || index}`,
      source: {
        type: "web",
        provider: this.name,
        url: result.url,
        title: result.title,
        domain: result.url ? new URL(result.url).hostname : null,
      },
      ranking: {
        position: index + 1,
        score: Array.isArray(result.highlightScores) && result.highlightScores.length > 0
          ? Math.max(...result.highlightScores.filter(Number.isFinite))
          : null,
      },
      evidence: {
        text: result.text || null,
        highlights: Array.isArray(result.highlights) ? result.highlights : [],
        summary: result.summary || null,
      },
      publication: {
        publishedAt: result.publishedDate || null,
        author: result.author || null,
      },
      media: {
        faviconUrl: result.favicon || null,
        thumbnailUrl: result.image || null,
      },
      metadata: {
        resolvedSearchType: data?.resolvedSearchType || null,
        subpages: Array.isArray(result.subpages) ? result.subpages : [],
        entities: Array.isArray(result.entities) ? result.entities : [],
        extras: result.extras || null,
      },
    }));

    return createSearchResponse({
      query,
      provider: {
        name: this.name,
        requestId: data?.requestId || null,
        latencyMs: Date.now() - startedAt,
      },
      results,
      usage: {
        quotaType: SEARCH_QUOTA_TYPES.CREDIT,
        providerSpecific: {
          costDollars: data?.costDollars || null,
          searchTime: data?.searchTime ?? null,
          resolvedSearchType: data?.resolvedSearchType || null,
        },
      },
      metadata: {
        context: data?.context || null,
        output: data?.output || null,
      },
      raw: data,
    });
  }
}

export const exaSearchProvider = new ExaSearchProvider();
