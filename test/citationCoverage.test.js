import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCitationCoverage } from "../src/services/search/citationCoverage.js";

test("evaluates valid citations and coverage", () => {
  const result = evaluateCitationCoverage("Fact A [S1]. Fact B [S2].", 3);

  assert.deepEqual(result.citedSourceIds, [1, 2]);
  assert.deepEqual(result.validCitations, [1, 2]);
  assert.deepEqual(result.invalidCitations, []);
  assert.equal(result.citationCount, 2);
  assert.equal(result.uniqueCitationCount, 2);
  assert.equal(result.coverageRatio, 2 / 3);
  assert.equal(result.hasInvalidCitation, false);
  assert.equal(result.hasCitation, true);
});

test("detects citations to sources that do not exist", () => {
  const result = evaluateCitationCoverage("Fact [S1] [S4]", 2);

  assert.deepEqual(result.validCitations, [1]);
  assert.deepEqual(result.invalidCitations, [4]);
  assert.equal(result.hasInvalidCitation, true);
});

test("deduplicates repeated source citations for coverage", () => {
  const result = evaluateCitationCoverage("Fact [S1] [S1] [S2]", 2);

  assert.equal(result.citationCount, 3);
  assert.equal(result.uniqueCitationCount, 2);
  assert.equal(result.coverageRatio, 1);
});

test("returns null coverage when no sources are available", () => {
  const result = evaluateCitationCoverage("Answer without sources", 0);

  assert.equal(result.coverageRatio, null);
  assert.equal(result.hasCitation, false);
});
