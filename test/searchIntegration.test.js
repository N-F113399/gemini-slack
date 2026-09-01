import test from "node:test";
import assert from "node:assert/strict";
import { SearchService } from "../src/services/search/searchService.js";
import { SearchProviderError, SEARCH_ERROR_CODES } from "../src/services/search/searchErrors.js";
import { createSearchResult } from "../src/services/search/searchModels.js";
import { decideSearch } from "../src/services/search/searchDecision.js";
import { selectEvidence, buildSelectedEvidenceText } from "../src/services/search/evidenceSelector.js";
import { buildSearchSources } from "../src/services/search/searchContextBuilder.js";

function result({ id, url, title, score = 0.9, position = 1, text = "Relevant evidence" }) {
  return createSearchResult({
    id,
    source: {
      type: "web",
      provider: "test",
      url,
      title,
      domain: new URL(url).hostname,
    },
    ranking: { score, position },
    evidence: { text },
  });
}

function responseFor(results, provider = "test") {
  return {
    query: { text: "integration query" },
    provider: { name: provider, requestId: "req-1", latencyMs: 10 },
    results,
    usage: {},
    metadata: {},
  };
}

test("web search pipeline carries selected evidence and sources into the final context", async () => {
  let calls = 0;
  const provider = {
    name: "test",
    async search() {
      calls += 1;
      return responseFor([
        result({
          id: "first",
          url: "https://example.com/one",
          title: "First source",
          position: 2,
          score: 0.7,
        }),
        result({
          id: "second",
          url: "https://docs.example.com/two",
          title: "Second source",
          position: 1,
          score: 0.8,
        }),
      ]);
    },
  };

  const decision = decideSearch("search: PostgreSQL 18 latest features");
  assert.equal(decision.shouldSearch, true);

  const searchService = new SearchService({ providers: [provider] });
  const searchResponse = await searchService.search({
    text: decision.query,
    maxResults: 5,
  });

  const selection = selectEvidence(searchResponse, {
    maxResults: 1,
    maxEvidenceChars: 1000,
  });
  const contextText = buildSelectedEvidenceText(selection);
  const sources = buildSearchSources(searchResponse, 1);

  assert.equal(calls, 1);
  assert.equal(selection.resultCount, 1);
  assert.equal(selection.items[0].result.id, "second");
  assert.match(contextText, /Second source/);
  assert.match(contextText, /https:\/\/docs\.example\.com\/two/);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://docs.example.com/two");
});

test("web search pipeline falls back to the next provider on a retryable failure", async () => {
  const calls = [];
  const failingProvider = {
    name: "first",
    async search() {
      calls.push("first");
      throw new SearchProviderError(
        SEARCH_ERROR_CODES.PROVIDER_ERROR,
        "temporary failure",
        { provider: "first", status: 500, retryable: true },
      );
    },
  };
  const successfulProvider = {
    name: "second",
    async search() {
      calls.push("second");
      return responseFor([
        result({
          id: "fallback",
          url: "https://fallback.example/result",
          title: "Fallback source",
        }),
      ], "second");
    },
  };

  const searchService = new SearchService({
    providers: [failingProvider, successfulProvider],
  });
  const searchResponse = await searchService.search({
    text: "search: fallback test",
  });

  assert.deepEqual(calls, ["first", "second"]);
  assert.equal(searchResponse.provider.name, "second");
  assert.equal(searchResponse.results[0].source.title, "Fallback source");
});

test("ordinary conversations do not enter the web search pipeline", async () => {
  const decision = decideSearch("PostgreSQLについて教えて");
  assert.equal(decision.shouldSearch, false);
  assert.equal(decision.query, null);
});
