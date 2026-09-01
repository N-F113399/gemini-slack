import test from "node:test";
import assert from "node:assert/strict";
import { YouSearchProvider } from "../src/services/search/providers/youProvider.js";
import { createSearchQuery, SEARCH_RESULT_TYPES } from "../src/services/search/searchModels.js";
import { SEARCH_ERROR_CODES, SearchProviderError } from "../src/services/search/searchErrors.js";

const provider = new YouSearchProvider();

test("You.com provider requires an API key", async () => {
  const previous = process.env.YDC_API_KEY;
  delete process.env.YDC_API_KEY;
  await assert.rejects(
    () => provider.search(createSearchQuery({ text: "test" })),
    error => error instanceof SearchProviderError && error.code === SEARCH_ERROR_CODES.AUTHENTICATION,
  );
  if (previous === undefined) delete process.env.YDC_API_KEY;
  else process.env.YDC_API_KEY = previous;
});

test("You.com provider normalizes web and news results", async () => {
  const previousKey = process.env.YDC_API_KEY;
  process.env.YDC_API_KEY = "test-key";
  const client = async (url, options) => {
    assert.match(url, /query=latest/);
    assert.match(url, /count=2/);
    assert.equal(options.method, "GET");
    assert.equal(options.headers["X-API-Key"], "test-key");

    return new Response(JSON.stringify({
      results: {
        web: [{
          url: "https://example.com/web",
          title: "Web result",
          description: "Web description",
          snippets: ["Web snippet"],
          thumbnail_url: "https://example.com/thumb.png",
          favicon_url: "https://example.com/favicon.ico",
        }],
        news: [{
          url: "https://example.com/news",
          title: "News result",
          description: "News description",
          page_age: "2026-09-01T10:00:00",
          thumbnail_url: "https://example.com/news.png",
        }],
      },
      metadata: {
        search_uuid: "search-1",
        query: "latest",
        latency: 0.684,
      },
    }), { status: 200 });
  };

  try {
    const testProvider = new YouSearchProvider({ fetchImpl: client });
    const response = await testProvider.search(createSearchQuery({ text: "latest", maxResults: 2 }));

    assert.equal(response.provider.name, "you");
    assert.equal(response.provider.requestId, "search-1");
    assert.equal(response.provider.latencyMs, 684);
    assert.equal(response.results.length, 2);
    assert.equal(response.results[0].source.type, SEARCH_RESULT_TYPES.WEB);
    assert.deepEqual(response.results[0].evidence.snippets, ["Web snippet"]);
    assert.equal(response.results[1].source.type, SEARCH_RESULT_TYPES.NEWS);
    assert.equal(response.results[1].publication.publishedAt, "2026-09-01T10:00:00");
    assert.deepEqual(response.metadata.resultCounts, { web: 1, news: 1 });
  } finally {
    if (previousKey === undefined) delete process.env.YDC_API_KEY;
    else process.env.YDC_API_KEY = previousKey;
  }
});

for (const status of [401, 402, 403, 422, 500]) {
  test(`You.com provider maps HTTP ${status}`, async () => {
    const previousKey = process.env.YDC_API_KEY;
    process.env.YDC_API_KEY = "test-key";
    const testProvider = new YouSearchProvider({
      fetchImpl: async () => new Response(JSON.stringify({ error: "error" }), { status }),
    });

    try {
      await assert.rejects(
        () => testProvider.search(createSearchQuery({ text: "test" })),
        error => error instanceof SearchProviderError && error.status === status,
      );
    } finally {
      if (previousKey === undefined) delete process.env.YDC_API_KEY;
      else process.env.YDC_API_KEY = previousKey;
    }
  });
}
