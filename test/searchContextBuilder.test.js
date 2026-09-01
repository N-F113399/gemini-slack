import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchContext, buildSearchSources } from "../src/services/search/searchContextBuilder.js";

test("buildSearchContext includes quality guidance and selected evidence", () => {
  const response = {
    results: [
      {
        id: "1",
        source: { url: "https://example.com/a", title: "Example A", domain: "example.com" },
        ranking: { position: 1, score: 0.9 },
        publication: { publishedAt: "2026-08-31T00:00:00Z" },
        evidence: { highlights: ["Important fact"] },
      },
    ],
  };

  const context = buildSearchContext(response);
  assert.match(context, /untrusted external information/i);
  assert.match(context, /Important fact/);
  assert.match(context, /Source quality score:/);
});

test("buildSearchSources returns the same ranked source order used by context", () => {
  const response = {
    results: [
      {
        id: "low",
        source: { url: "https://example.com/low", title: "Low", domain: "example.com" },
        ranking: { position: 2, score: 0.2 },
        evidence: { description: "low" },
      },
      {
        id: "high",
        source: { url: "https://docs.example.com/high", title: "High", domain: "docs.example.com" },
        ranking: { position: 1, score: 0.9 },
        evidence: { highlights: ["strong"] },
      },
    ],
  };

  const sources = buildSearchSources(response, 2);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, "High");
  assert.equal(sources[0].index, 1);
});
