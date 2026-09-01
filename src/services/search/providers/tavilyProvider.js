import fetch from "node-fetch";
import { SearchProvider } from "../searchProvider.js";
import { SEARCH_PROVIDER_CAPABILITIES, SEARCH_PROVIDER_NAMES } from "../searchModels.js";
import { createSearchResult, createSearchResponse } from "../searchModels.js";
import { SearchProviderError } from "../searchErrors.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const API_URL = "https://api.tavily.com/search";

function getTimeoutMs() {
  const value = Number(process.env.TAVILY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function mapStatus(status) {
  if (status === 400) return { code: "SEARCH_INVALID_REQUEST", retryable: false, quotaRelated: false };
  if (status === 401) return { code: "SEARCH_AUTHENTICATION_ERROR", retryable: false, quotaRelated: false };
  if (status === 429) return { code: "SEARCH_RATE_LIMITED", retryable: true, quotaRelated: false };
  if (status === 432 || status === 433) return { code: "SEARCH_QUOTA_EXCEEDED", retryable: false, quotaRelated: true };
  if (status >= 500) return { code: "SEARCH_PROVIDER_ERROR", retryable: true, quotaRelated: false };
  return { code: "SEARCH_PROVIDER_ERROR", retryable: false, quotaRelated: false };
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

function getErrorMessage(data, fallbackStatus) {
  return data?.detail?.error || data?.error?.message || `Tavily request failed with status ${fallbackStatus}`;
}

export class TavilySearchProvider extends SearchProvider {
  constructor() {
    super({
      name: SEARCH_PROVIDER_NAMES.TAVILY,
      capabilities: SEARCH_PROVIDER_CAPABILITIES[SEARCH_PROVIDER_NAMES.TAVILY],
    });
  }

  async search(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new SearchProviderError({
        code: "SEARCH_AUTHENTICATION_ERROR",
        provider: this.name,
        message: "TAVILY_API_KEY is not configured",
        retryable: false,
        quotaRelated: false,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
    const startedAt = Date.now();

    let response;
    let data;
    try {
      response = await fetch(API_URL, {
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
      const aborted = error?.name === "AbortError";
      throw new SearchProviderError({
        code: aborted ? "SEARCH_TIMEOUT" : "SEARCH_NETWORK_ERROR",
        provider: this.name,
        message: aborted ? "Tavily request timed out" : error.message,
        retryable: true,
        quotaRelated: false,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const mapped = mapStatus(response.status);
      throw new SearchProviderError({
        ...mapped,
        provider: this.name,
        status: response.status,
        message: getErrorMessage(data, response.status),
      });
    }

    const results = (data?.results || []).map((result, index) => createSearchResult({
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
        text: result.content || result.raw_content || null,
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
        quotaType: "credit",
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
