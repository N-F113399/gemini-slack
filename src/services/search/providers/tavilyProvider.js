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
const API_URL = "https://api.tavily.com/search";

function getTimeoutMs() {
  const value = Number(process.env.TAVILY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function getErrorMessage(data, fallbackStatus) {
  return data?.detail?.error || data?.error?.message || `Tavily request failed with status ${fallbackStatus}`;
}

function mapStatus(status) {
  if (status === 400) return SEARCH_ERROR_CODES.INVALID_REQUEST;
  if (status === 401) return SEARCH_ERROR_CODES.AUTHENTICATION;
  if (status === 429) return SEARCH_ERROR_CODES.QUOTA_EXCEEDED;
  if (status === 432 || status === 433) return SEARCH_ERROR_CODES.QUOTA_EXCEEDED;
  if (status >= 500) return SEARCH_ERROR_CODES.PROVIDER_ERROR;
  return SEARCH_ERROR_CODES.PROVIDER_ERROR;
}

function toQueryPayload(query) {
  const payload = {
    query: query.text,
    search_depth: "basic",
    max_results: query.maxResults,
    topic: query.type === "news" ? "news" : "general",
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    include_favicon: true,
  };

  if (query.language) payload.language = query.language;
  if (query.domains?.length) payload.include_domains = query.domains;
  if (query.recency) payload.time_range = query.recency;
  return payload;
}

function createProviderError(code, message, status = null, cause = null) {
  return new SearchProviderError(code, message, {
    provider: SEARCH_PROVIDER_NAMES.TAVILY,
    status,
    retryable: code === SEARCH_ERROR_CODES.PROVIDER_ERROR || code === SEARCH_ERROR_CODES.TIMEOUT || code === SEARCH_ERROR_CODES.UNAVAILABLE,
    quotaRelated: code === SEARCH_ERROR_CODES.QUOTA_EXCEEDED,
    cause,
  });
}

export class TavilySearchProvider extends SearchProvider {
  constructor({ fetchImpl = fetch } = {}) {
    super({
      name: SEARCH_PROVIDER_NAMES.TAVILY,
      capabilities: SEARCH_PROVIDER_CAPABILITIES[SEARCH_PROVIDER_NAMES.TAVILY],
    });
    this.fetchImpl = fetchImpl;
  }

  async search(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw createProviderError(
        SEARCH_ERROR_CODES.AUTHENTICATION,
        "TAVILY_API_KEY is not configured",
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
          Authorization: `Bearer ${apiKey}`,
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
      throw createProviderError(code, error?.name === "AbortError" ? "Tavily request timed out" : error.message, null, error);
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
        "Tavily response does not contain a results array",
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
        score: typeof result.score === "number" ? result.score : null,
      },
      evidence: {
        text: result.raw_content || result.content || null,
      },
      media: {
        faviconUrl: result.favicon || null,
        thumbnailUrl: result.images?.[0]?.url || null,
      },
      metadata: {
        images: Array.isArray(result.images) ? result.images : [],
      },
    }));

    return createSearchResponse({
      query,
      provider: {
        name: this.name,
        requestId: data?.request_id || null,
        latencyMs: Date.now() - startedAt,
      },
      results,
      usage: {
        quotaType: SEARCH_QUOTA_TYPES.CREDIT,
        credits: data?.usage?.credits ?? null,
        providerSpecific: {
          responseTime: data?.response_time ?? null,
          autoParameters: data?.auto_parameters ?? null,
        },
      },
      metadata: {
        answer: data?.answer ?? null,
        images: Array.isArray(data?.images) ? data.images : [],
      },
      raw: data,
    });
  }
}

export const tavilySearchProvider = new TavilySearchProvider();
