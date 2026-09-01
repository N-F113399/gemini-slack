import test from "node:test";
import assert from "node:assert/strict";
import { SearchService } from "../src/services/search/searchService.js";
import { SearchProviderError, SEARCH_ERROR_CODES } from "../src/services/search/searchErrors.js";
import { UsageTracker } from "../src/services/usage/usageTracker.js";

function response(provider) {
  return {
    query: { text: "latest test" },
    provider: { name: provider, requestId: `${provider}-request`, latencyMs: 1 },
    results: [{
      id: `${provider}-1`,
      source: { provider, url: "https://example.com", title: "Example" },
      evidence: { text: "evidence" },
    }],
    usage: { credits: provider === "tavily" ? 1 : null, requests: 1 },
  };
}

test("records successful search usage", async () => {
  const tracker = new UsageTracker({ maxEvents: 10 });
  const service = new SearchService({
    usageTracker: tracker,
    providers: [{ name: "tavily", search: async () => response("tavily") }],
  });

  await service.search({ text: "latest test" });
  const events = tracker.list({ provider: "tavily", service: "search" });

  assert.equal(events.length, 1);
  assert.equal(events[0].success, true);
  assert.equal(events[0].search.credits, 1);
  assert.equal(events[0].metadata.resultCount, 1);
});

test("records failed provider attempts before fallback", async () => {
  const tracker = new UsageTracker({ maxEvents: 10 });
  const service = new SearchService({
    usageTracker: tracker,
    providers: [
      {
        name: "tavily",
        search: async () => {
          throw new SearchProviderError(
            SEARCH_ERROR_CODES.PROVIDER_ERROR,
            "temporary failure",
            { provider: "tavily", status: 500, retryable: true },
          );
        },
      },
      { name: "exa", search: async () => response("exa") },
    ],
  });

  const result = await service.search({ text: "latest test" });
  assert.equal(result.provider.name, "exa");

  const events = tracker.list({ service: "search" });
  assert.equal(events.length, 2);
  assert.equal(events[0].provider, "tavily");
  assert.equal(events[0].success, false);
  assert.equal(events[1].provider, "exa");
  assert.equal(events[1].success, true);
});
