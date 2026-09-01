import test from "node:test";
import assert from "node:assert/strict";
import { scoreSearchAnswer } from "../src/services/search/searchQualityScorer.js";

test("scores a well-supported answer highly", () => {
  const result = scoreSearchAnswer({
    citationCoverage: {
      sourceCount: 2,
      coverageRatio: 1,
      hasInvalidCitation: false,
    },
    evaluatedSources: [{ qualityScore: 90 }, { qualityScore: 80 }],
    conflicts: [],
  });

  assert.equal(result.lowQuality, false);
  assert.equal(result.flags.length, 0);
  assert.ok(result.score > 0.8);
});

test("flags invalid citations", () => {
  const result = scoreSearchAnswer({
    citationCoverage: {
      sourceCount: 2,
      coverageRatio: 0.5,
      hasInvalidCitation: true,
    },
    evaluatedSources: [{ qualityScore: 80 }, { qualityScore: 80 }],
    conflicts: [],
  });

  assert.equal(result.lowQuality, true);
  assert.ok(result.flags.includes("invalid_citation"));
});

test("penalizes conflicting sources", () => {
  const result = scoreSearchAnswer({
    citationCoverage: {
      sourceCount: 2,
      coverageRatio: 1,
      hasInvalidCitation: false,
    },
    evaluatedSources: [{ qualityScore: 80 }, { qualityScore: 80 }],
    conflicts: [{ sourceIds: [1, 2] }],
  });

  assert.ok(result.components.conflict < 1);
  assert.ok(result.flags.includes("source_conflict"));
});

test("handles zero sources without division by zero", () => {
  const result = scoreSearchAnswer({
    citationCoverage: {
      sourceCount: 0,
      coverageRatio: null,
      hasInvalidCitation: false,
    },
    evaluatedSources: [],
    conflicts: [],
  });

  assert.equal(result.components.citation, 1);
  assert.equal(result.lowQuality, false);
});
