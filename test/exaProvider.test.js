import test from "node:test";
import assert from "node:assert/strict";
import { ExaSearchProvider } from "../src/services/search/providers/exaProvider.js";
import { createSearchQuery, SEARCH_ERROR_CODES } from "../src/services/search/searchModels.js";
import { SearchProviderError } from "../src/services/search/searchErrors.js";

const query = createSearchQuery({ text: "latest AI news", maxResults: 2 });

test("Exa provider requires an API key", async () => {
  const previous = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  const provider = new ExaSearchProvider({ fetchImpl: async () => { throw new Error("should not fetch"); } });
  await assert.rejects(
    () => provider.search(query),
    error => error instanceof SearchProviderError && error.code === SEARCH_ERROR_CODES.AUTHENTICATION,
  );
  if (previous === undefined) delete process.env.EXA_API_KEY;
  else process.env.EXA_API_KEY = previous;
});

test("Exa provider sends the query and normalizes highlights", async () => {
  const previous = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "test-key";
  const calls = [];
  const provider = new ExaSearchProvider({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        results: [{
          id: "https://example.com/a",
          title: "Example",
          url: "https://example.com/a",
          publishedDate: "2026-08-31T00:00:00.000Z",
          author: "Author",
          favicon: "https://example.com/favicon.ico",
          text: "Full page text",
          highlights: ["Relevant excerpt"],
          highlightScores: [0.87],
          summary: "Summary",
          image: "https://example.com/image.png",
        }],
        requestId: "req-1",
        resolvedSearchType: "auto",
        searchTime: 123.4,
        costDollars: { total: 0.007 },
        context: "context",
        output: { content: "output" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  try {
    const response = await provider.search(query);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.exa.ai/search");
    assert.equal(calls[0].options.headers["x-api-key"], "test-key");
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.query, "latest AI news");
    assert.equal(payload.numResults, 2);
    assert.equal(payload.contents.highlights, true);
    assert.equal(response.provider.name, "exa");
    assert.equal(response.provider.requestId, "req-1");
    assert.equal(response.results.length, 1);
    assert.deepEqual(response.results[0].evidence.highlights, ["Relevant excerpt"]);
    assert.equal(response.results[0].evidence.text, "Full page text");
    assert.equal(response.results[0].evidence.summary, "Summary");
    assert.equal(response.results[0].ranking.score, 0.87);
    assert.equal(response.results[0].publication.author, "Author");
    assert.equal(response.usage.providerSpecific.costDollars.total, 0.007);
  } finally {
    if (previous === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previous;
  }
});

test("Exa provider maps rate-limit errors to quota exhaustion", async () => {
  const previous = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "test-key";
  const provider = new ExaSearchProvider({
    fetchImpl: async () => new Response(JSON.stringify({ requestId: "req-429", error: "rate limit", tag: "RATE_LIMIT_EXCEEDED" }), { status: 429 }),
  });

  try {
    await assert.rejects(
      () => provider.search(query),
      error => error instanceof SearchProviderError
        && error.code === SEARCH_ERROR_CODES.QUOTA_EXCEEDED
        && error.status === 429
        && error.quotaRelated === true,
    );
  } finally {
    if (previous === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previous;
  }
});
