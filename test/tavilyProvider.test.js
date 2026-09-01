import test from "node:test";
import assert from "node:assert/strict";
import { TavilySearchProvider } from "../src/services/search/providers/tavilyProvider.js";
import { createSearchQuery, SEARCH_QUOTA_TYPES } from "../src/services/search/searchModels.js";
import { SEARCH_ERROR_CODES, SearchProviderError } from "../src/services/search/searchErrors.js";

const createMockResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("Tavily provider requires an API key", async () => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const provider = new TavilySearchProvider();
    await assert.rejects(
      () => provider.search(createSearchQuery({ text: "test" })),
      error => error instanceof SearchProviderError && error.code === SEARCH_ERROR_CODES.AUTHENTICATION,
    );
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("Tavily provider normalizes a successful response", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-key";
  const provider = new TavilySearchProvider({
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      const payload = JSON.parse(options.body);
      assert.equal(payload.query, "latest news");
      assert.equal(payload.max_results, 2);
      return createMockResponse({
        query: "latest news",
        results: [{
          title: "Example",
          url: "https://example.com/article",
          content: "Relevant content",
          score: 0.91,
          raw_content: null,
          favicon: "https://example.com/favicon.ico",
          id: "r1",
        }],
        response_time: "0.42",
        usage: { credits: 1 },
        request_id: "req-1",
      });
    },
  });

  try {
    const response = await provider.search(createSearchQuery({ text: "latest news", maxResults: 2 }));
    assert.equal(response.provider.name, "tavily");
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].source.url, "https://example.com/article");
    assert.equal(response.results[0].evidence.text, "Relevant content");
    assert.equal(response.results[0].ranking.score, 0.91);
    assert.equal(response.usage.quotaType, SEARCH_QUOTA_TYPES.CREDIT);
    assert.equal(response.usage.credits, 1);
    assert.equal(response.provider.requestId, "req-1");
  } finally {
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});

test("Tavily provider maps authentication errors", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "test-key";
  const provider = new TavilySearchProvider({
    fetchImpl: async () => createMockResponse({ detail: { error: "Unauthorized" } }, 401),
  });

  try {
    await assert.rejects(
      () => provider.search(createSearchQuery({ text: "test" })),
      error => error instanceof SearchProviderError
        && error.code === SEARCH_ERROR_CODES.AUTHENTICATION
        && error.status === 401
        && error.retryable === false,
    );
  } finally {
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});
