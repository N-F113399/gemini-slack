import test from "node:test";
import assert from "node:assert/strict";
import { createSearchResponse, createSearchResult, createSearchQuery } from "../src/services/search/searchModels.js";
import { searchResultToContent, searchResponseToContents, buildSearchContextText } from "../src/services/search/searchContentResolver.js";

test("search result maps evidence into a remote text content", () => {
  const result = createSearchResult({
    id: "r1",
    source: { provider: "exa", type: "web", url: "https://example.com", title: "Example" },
    ranking: { position: 1, score: 0.91 },
    evidence: { description: "Description", highlights: ["Highlight"], text: "Body" },
  });

  const content = searchResultToContent(result);
  assert.equal(content.kind, "remote");
  assert.equal(content.source.type, "url");
  assert.equal(content.source.ref, "https://example.com");
  assert.match(content.representations[0].text, /Description/);
  assert.match(content.representations[0].text, /Highlight/);
  assert.match(content.representations[0].text, /Body/);
  assert.equal(content.metadata.provider, "exa");
  assert.equal(content.metadata.title, "Example");
});

test("search response maps multiple results in order", () => {
  const response = createSearchResponse({
    query: createSearchQuery({ text: "test" }),
    provider: { name: "tavily" },
    results: [
      createSearchResult({ id: "1", source: { url: "https://a.example", title: "A" }, evidence: { snippet: "A" } }),
      createSearchResult({ id: "2", source: { url: "https://b.example", title: "B" }, evidence: { snippet: "B" } }),
    ],
  });

  const contents = searchResponseToContents(response);
  assert.deepEqual(contents.map(content => content.source.ref), [
    "https://a.example",
    "https://b.example",
  ]);
});

test("search context includes source title and URL", () => {
  const response = createSearchResponse({
    query: createSearchQuery({ text: "test" }),
    provider: { name: "you" },
    results: [createSearchResult({
      id: "1",
      source: { url: "https://example.com", title: "Example" },
      evidence: { description: "Useful information" },
    })],
  });

  const context = buildSearchContextText(response);
  assert.match(context, /\[Web Source 1\]/);
  assert.match(context, /Title: Example/);
  assert.match(context, /URL: https:\/\/example\.com/);
  assert.match(context, /Useful information/);
});
