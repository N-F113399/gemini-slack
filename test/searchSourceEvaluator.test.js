import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSearchSources,
  detectSourceAgreement,
  detectSourceConflicts,
  buildSourceGuidance,
} from "../src/services/search/searchSourceEvaluator.js";

const result = (id, title, url, snippet, score = 0.8) => ({
  id,
  source: { title, url },
  evidence: { snippets: [snippet] },
  ranking: { position: 1, score },
});

test("evaluates source authority and quality", () => {
  const evaluated = evaluateSearchSources([
    result("gov", "Official", "https://www.example.gov/report", "official evidence"),
    result("web", "Other", "https://example.com/article", "other evidence"),
  ]);
  assert.ok(evaluated[0].qualityScore > evaluated[1].qualityScore);
  assert.equal(evaluated[0].authorityScore, 12);
});

test("detects strong cross-source agreement", () => {
  const sources = evaluateSearchSources([
    result("a", "Same topic", "https://a.example.com", "alpha beta gamma delta"),
    result("b", "Same topic", "https://b.example.com", "alpha beta gamma delta"),
  ]);
  const agreements = detectSourceAgreement(sources);
  assert.equal(agreements.length, 1);
});

test("detects conflicting evidence for similar titles", () => {
  const sources = evaluateSearchSources([
    result("a", "PostgreSQL release date", "https://a.example.com", "release is scheduled for June 1"),
    result("b", "PostgreSQL release date", "https://b.example.com", "release is scheduled for July 1"),
  ]);
  const conflicts = detectSourceConflicts(sources);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].sourceIds, ["a", "b"]);
});

test("source guidance exposes conflicts and safety instructions", () => {
  const guidance = buildSourceGuidance([
    result("a", "PostgreSQL release date", "https://a.example.com", "June 1"),
    result("b", "PostgreSQL release date", "https://b.example.com", "July 1"),
  ]);
  assert.equal(guidance.conflicts.length, 1);
  assert.match(guidance.instruction, /untrusted evidence/i);
});
