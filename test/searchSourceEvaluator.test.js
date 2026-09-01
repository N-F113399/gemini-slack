import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSearchSources,
  detectSourceAgreement,
  buildSourceGuidance,
} from "../src/services/search/searchSourceEvaluator.js";

const result = ({ id, url, domain, score, position, publishedAt, evidence }) => ({
  id,
  source: { type: "web", provider: "test", url, title: id, domain },
  ranking: { score, position },
  publication: { publishedAt },
  evidence,
});

test("evaluateSearchSources ranks by relevance, preferred domain, freshness, and evidence", () => {
  const now = Date.parse("2026-09-01T00:00:00Z");
  const evaluated = evaluateSearchSources([
    result({
      id: "weak",
      url: "https://example.com/weak",
      domain: "example.com",
      score: 0.2,
      position: 4,
      publishedAt: "2026-08-01T00:00:00Z",
      evidence: { description: "old" },
    }),
    result({
      id: "preferred",
      url: "https://docs.example.com/strong",
      domain: "docs.example.com",
      score: 0.7,
      position: 2,
      publishedAt: "2026-08-31T00:00:00Z",
      evidence: { highlights: ["authoritative evidence"] },
    }),
  ], { preferredDomains: ["docs.example.com"], now });

  const preferred = evaluated.find(item => item.result.id === "preferred");
  const weak = evaluated.find(item => item.result.id === "weak");
  assert.ok(preferred.qualityScore > weak.qualityScore);
});

test("detectSourceAgreement identifies overlapping evidence", () => {
  const evaluated = evaluateSearchSources([
    result({ id: "a", url: "https://a.example/a", score: 0.8, position: 1, evidence: { text: "PostgreSQL 18 was released with new improvements" } }),
    result({ id: "b", url: "https://b.example/b", score: 0.7, position: 2, evidence: { text: "PostgreSQL 18 was released with new improvements" } }),
  ]);

  const agreements = detectSourceAgreement(evaluated);
  assert.equal(agreements.length, 1);
  assert.deepEqual(agreements[0].sourceIds, ["a", "b"]);
});

test("buildSourceGuidance includes conflict-aware instructions", () => {
  const guidance = buildSourceGuidance([
    result({ id: "a", url: "https://a.example/a", score: 0.8, position: 1, evidence: { text: "A fact" } }),
  ]);

  assert.match(guidance.instruction, /untrusted evidence/i);
  assert.match(guidance.instruction, /multiple independent sources/i);
  assert.equal(guidance.ranked.length, 1);
});
