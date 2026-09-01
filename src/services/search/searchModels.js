export const SEARCH_PROVIDER_NAMES = Object.freeze({
  TAVILY: "tavily",
  EXA: "exa",
  YOU: "you",
});

export const SEARCH_RESULT_TYPES = Object.freeze({
  WEB: "web",
  NEWS: "news",
});

export const SEARCH_QUOTA_TYPES = Object.freeze({
  CREDIT: "credit",
  DAILY_REQUEST: "daily_request",
  MONTHLY_REQUEST: "monthly_request",
  UNKNOWN: "unknown",
});

export function createSearchQuery({
  text,
  language = null,
  region = null,
  domains = [],
  recency = null,
  maxResults = 5,
  type = SEARCH_RESULT_TYPES.WEB,
  metadata = {},
}) {
  if (typeof text !== "string" || !text.trim()) {
    throw new TypeError("Search query text is required");
  }
  if (!Array.isArray(domains)) throw new TypeError("Search query domains must be an array");
  if (!Number.isInteger(maxResults) || maxResults <= 0) {
    throw new TypeError("Search query maxResults must be a positive integer");
  }

  return Object.freeze({
    text: text.trim(),
    language,
    region,
    domains: Object.freeze([...domains]),
    recency,
    maxResults,
    type,
    metadata: Object.freeze({ ...metadata }),
  });
}

export function createSearchResult({
  id,
  source = {},
  ranking = {},
  evidence = {},
  publication = {},
  media = {},
  metadata = {},
}) {
  if (!id) throw new TypeError("Search result id is required");
  if (!source.url) throw new TypeError("Search result source.url is required");

  return Object.freeze({
    id,
    source: Object.freeze({
      type: source.type || SEARCH_RESULT_TYPES.WEB,
      provider: source.provider || null,
      url: source.url,
      title: source.title || null,
      domain: source.domain || null,
    }),
    ranking: Object.freeze({
      position: ranking.position ?? null,
      score: ranking.score ?? null,
    }),
    evidence: Object.freeze({
      description: evidence.description ?? null,
      snippet: evidence.snippet ?? null,
      snippets: Object.freeze(Array.isArray(evidence.snippets) ? [...evidence.snippets] : []),
      highlights: Object.freeze(Array.isArray(evidence.highlights) ? [...evidence.highlights] : []),
      text: evidence.text ?? null,
      summary: evidence.summary ?? null,
    }),
    publication: Object.freeze({
      publishedAt: publication.publishedAt ?? null,
      author: publication.author ?? null,
    }),
    media: Object.freeze({
      thumbnailUrl: media.thumbnailUrl ?? null,
      faviconUrl: media.faviconUrl ?? null,
    }),
    metadata: Object.freeze({ ...metadata }),
  });
}

export function createSearchResponse({
  query,
  provider,
  results = [],
  usage = {},
  metadata = {},
  raw = null,
}) {
  if (!query) throw new TypeError("Search response query is required");
  if (!provider?.name) throw new TypeError("Search response provider.name is required");
  if (!Array.isArray(results)) throw new TypeError("Search response results must be an array");

  return Object.freeze({
    query,
    provider: Object.freeze({
      name: provider.name,
      requestId: provider.requestId ?? null,
      latencyMs: provider.latencyMs ?? null,
    }),
    results: Object.freeze([...results]),
    usage: Object.freeze({
      quotaType: usage.quotaType || SEARCH_QUOTA_TYPES.UNKNOWN,
      credits: usage.credits ?? null,
      requests: usage.requests ?? null,
      providerSpecific: Object.freeze({ ...(usage.providerSpecific || {}) }),
    }),
    metadata: Object.freeze({ ...metadata }),
    raw,
  });
}

export const SEARCH_PROVIDER_CAPABILITIES = Object.freeze({
  [SEARCH_PROVIDER_NAMES.TAVILY]: Object.freeze({ web: true, news: false, semantic: false, snippets: true, fullText: true }),
  [SEARCH_PROVIDER_NAMES.EXA]: Object.freeze({ web: true, news: false, semantic: true, snippets: true, fullText: true }),
  [SEARCH_PROVIDER_NAMES.YOU]: Object.freeze({ web: true, news: true, semantic: false, snippets: true, fullText: false }),
});
