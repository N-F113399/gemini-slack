import test from "node:test";
import assert from "node:assert/strict";
import { runSearchAnswerPipeline } from "../src/services/search/searchAnswerPipeline.js";

test("search pipeline runs decision -> provider -> evidence -> attribution -> quality", async () => {
  const calls = [];
  const searchService = {
    async search(options) {
      calls.push(["search", options]);
      return {
        provider: { name: "tavily" },
        results: [
          {
            source: { title: "Example article", url: "https://example.com/article" },
            evidence: { summary: "The policy takes effect on June 1." },
            ranking: { score: 0.9, position: 1 },
          },
          {
            source: { title: "Example news", url: "https://reuters.com/example" },
            evidence: { summary: "The policy takes effect on June 1." },
            ranking: { score: 0.8, position: 2 },
          },
        ],
      };
    },
  };

  const result = await runSearchAnswerPipeline({
    userMessage: "最新のpolicy変更を検索して",
    searchService,
    generateAnswer: async context => {
      calls.push(["generate", context]);
      return "The policy takes effect on June 1. [S1]";
    },
    searchOptions: { language: "ja" },
  });

  assert.equal(result.decision.shouldSearch, true);
  assert.equal(calls[0][0], "search");
  assert.equal(calls[1][0], "generate");
  assert.equal(result.sources[0].sourceId, "S1");
  assert.equal(result.sources[1].sourceId, "S2");
  assert.deepEqual(result.citationCoverage.validCitations, [1]);
  assert.deepEqual(result.citationCoverage.invalidCitations, []);
  assert.equal(result.qualityScore.lowQuality, false);
});

test("non-search question bypasses the search provider", async () => {
  let searched = false;
  const result = await runSearchAnswerPipeline({
    userMessage: "このコードの意味を説明して",
    searchService: {
      async search() {
        searched = true;
        throw new Error("search should not run");
      },
    },
    generateAnswer: async ({ evidence }) => {
      assert.equal(evidence, null);
      return "通常の回答";
    },
  });

  assert.equal(searched, false);
  assert.equal(result.decision.shouldSearch, false);
  assert.equal(result.citationCoverage, null);
});

test("invalid citation is surfaced by the end-to-end evaluation", async () => {
  const result = await runSearchAnswerPipeline({
    userMessage: "research this topic online",
    searchService: {
      async search() {
        return {
          provider: { name: "exa" },
          results: [{
            source: { title: "Topic", url: "https://example.com/topic" },
            evidence: { summary: "Fact A" },
            ranking: { score: 0.8, position: 1 },
          }],
        };
      },
    },
    generateAnswer: async () => "Fact A [S9]",
  });

  assert.deepEqual(result.citationCoverage.invalidCitations, [9]);
  assert.equal(result.qualityScore.lowQuality, true);
  assert.ok(result.qualityScore.flags.includes("invalid_citation"));
});
