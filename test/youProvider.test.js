import test from "node:test";
import assert from "node:assert/strict";
import { YouSearchProvider } from "../src/services/search/providers/youProvider.js";
import { createSearchQuery } from "../src/services/search/searchModels.js";
import { SEARCH_ERROR_CODES, SearchProviderError } from "../src/services/search/searchErrors.js";

const query = createSearchQuery({ text: "geopolitics", maxResults: 2 });

test("You.com provider requires an API key", async () => {
  const previous = process.env.YDC_API_KEY;
  delete process.env.YDC_API_KEY;
  const provider = new YouSearchProvider({ fetchImpl: async () => { throw new Error("must not fetch"); } });

  try {
    await assert.rejects(
      () => provider.search(query),
      error => error instanceof SearchProviderError && error.code === SEARCH_ERROR_CODES.AUTHENTICATION,
    );
  } finally {
    if (previous === undefined) delete process.env.YDC_API_KEY;
    else process.env.YDC_API_KEY = previous;
  }
});

test("You.com provider normalizes web and news results", async () => {
  const previous = process.env.YDC_API_KEY;
  process.env.YDC_API_KEY = "test-key";
  const provider = new YouSearchProvider({
    fetchImpl: async (url, options) => {
      assert.match(url, /query=geopolitics/);
      assert.equal(options.method, "GET");
      assert.equal(options.headers["X-API-Key"], "test-key");

      return new Response(JSON.stringify({
        results: {
          web: [{
            url: "https://example.com/web",
            title: "Web result",
            description: "Web description",
            snippets: ["Useful snippet"],
            thumbnail_url: "https://example.com/thumb.png",
            favicon_url: "https://example.com/favicon.ico",
          }],
          news: [{
            url: "https://news.example.com/article",
            title: "News result",
            description: "News description",
            page_age: "2026-09-01T01:02:03",
            thumbnail_url: "https://news.example.com/thumb.png",
          }],
        },
        metadata: {
          search_uuid: "search-123",
          query: "geopolitics",
          latency: 0.6842031478881836,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  try {
    const response = await provider.search(query);
    assert.equal(response.results.length, 2);
    assert.equal(response.provider.requestId, "search-123");
    assert.equal(response.provider.latencyMs, 684);

    assert.equal(response.results[0].source.type, "web");
    assert.equal(response.results[0].evidence.snippets[0], "Useful snippet");
    assert.equal(response.results[0].media.faviconUrl, "https://example.com/favicon.ico");

    assert.equal(response.results[1].source.type, "news");
    assert.equal(response.results[1].publication.publishedAt, "2026-09-01T01:02:03");
  } finally {
    if (previous === undefined) delete process.env.YDC_API_KEY;
    else process.env.YDC_API_KEY = previous;
  }
});

for (const [status, code] of [
  [401, SEARCH_ERROR_CODES.AUTHENTICATION],
  [402, SEARCH_ERROR_CODES.PAYMENT_REQUIRED],
  [403, SEARCH_ERROR_CODES.FORBIDDEN],
  [422, SEARCH_ERROR_CODES.INVALID_REQUEST],
  [500, SEARCH_ERROR_CODES.PROVIDER_ERROR],
]) {
  test(`You.com provider maps HTTP ${status}`, async () => {
    const previous = process.env.YDC_API_KEY;
    process.env.YDC_API_KEY = "test-key";
    const provider = new YouSearchProvider({
      fetchImpl: async () => new Response(JSON.stringify({ message: "error" }), { status }),
    });

    try {
      await assert.rejects(
        () => provider.search(query),
        error => error instanceof SearchProviderError && error.code === code && error.status === status,
      );
    } finally {
      if (previous === undefined) delete process.env.YDC_API_KEY;
      else process.env.YDC_API_KEY = previous;
    }
  });
}
