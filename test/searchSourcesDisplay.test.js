import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchSources } from "../src/services/search/searchContextBuilder.js";

test("buildSearchSources preserves source metadata for Slack display", () => {
  const sources = buildSearchSources({
    results: [
      {
        source: {
          title: "Example",
          url: "https://example.com/article",
          provider: "tavily",
        },
      },
      {
        source: {
          title: "Second",
          url: "https://example.org/news",
          provider: "exa",
        },
      },
    ],
  }, 5);

  assert.deepEqual(sources, [
    { index: 1, title: "Example", url: "https://example.com/article", provider: "tavily" },
    { index: 2, title: "Second", url: "https://example.org/news", provider: "exa" },
  ]);
});

test("buildSearchSources honors maxResults", () => {
  const sources = buildSearchSources({
    results: [
      { source: { title: "1", url: "https://example.com/1" } },
      { source: { title: "2", url: "https://example.com/2" } },
      { source: { title: "3", url: "https://example.com/3" } },
    ],
  }, 2);

  assert.equal(sources.length, 2);
  assert.equal(sources[1].index, 2);
});
