import test from "node:test";
import assert from "node:assert/strict";
import { createSearchQuery, createSearchResult, createSearchResponse } from "../src/services/search/searchModels.js";

test("createSearchQuery normalizes and freezes query data", () => {
  const query = createSearchQuery({ text: "  latest PostgreSQL  " });
  assert.equal(query.text, "latest PostgreSQL");
  assert.deepEqual(query.domains, []);
  assert.equal(Object.isFrozen(query), true);
});

test("createSearchResult keeps provider-specific evidence optional", () => {
  const result = createSearchResult({
    id: "you:web:1",
    source: { url: "https://example.com", provider: "you", title: "Example" },
    evidence: { description: "desc", snippets: ["snippet"] },
    publication: { publishedAt: "2025-11-25T12:31:29" },
  });

  assert.equal(result.source.provider, "you");
  assert.deepEqual(result.evidence.snippets, ["snippet"]);
  assert.equal(result.evidence.highlights.length, 0);
  assert.equal(result.publication.publishedAt, "2025-11-25T12:31:29");
});

test("createSearchResponse preserves usage and raw response", () => {
  const query = createSearchQuery({ text: "example" });
  const result = createSearchResult({ id: "1", source: { url: "https://example.com" } });
  const raw = { results: { web: [] } };
  const response = createSearchResponse({
    query,
    provider: { name: "you", requestId: "abc", latencyMs: 42 },
    results: [result],
    usage: { requests: 1 },
    raw,
  });

  assert.equal(response.results.length, 1);
  assert.equal(response.provider.requestId, "abc");
  assert.equal(response.usage.requests, 1);
  assert.equal(response.raw, raw);
});
