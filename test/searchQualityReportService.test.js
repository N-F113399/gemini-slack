import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSearchQualityRows } from "../src/services/usage/searchQualityReportService.js";

test("aggregateSearchQualityRows aggregates quality and citation metrics", () => {
  const report = aggregateSearchQualityRows([
    {
      metadata: {
        qualityEvaluation: {
          score: 0.9,
          lowQuality: false,
          flags: [],
          components: { conflict: 1 },
          citationCoverage: { coverageRatio: 1, hasInvalidCitation: false },
        },
      },
    },
    {
      metadata: {
        qualityEvaluation: {
          score: 0.4,
          lowQuality: true,
          flags: ["invalid_citation", "source_conflict"],
          components: { conflict: 0 },
          citationCoverage: { coverageRatio: 0.4, hasInvalidCitation: true },
        },
      },
    },
    { metadata: {} },
  ]);

  assert.equal(report.evaluatedAnswers, 2);
  assert.equal(report.lowQualityAnswers, 1);
  assert.equal(report.invalidCitationAnswers, 1);
  assert.equal(report.conflictedAnswers, 1);
  assert.equal(report.averageQualityScore, 0.65);
  assert.equal(report.averageCitationCoverage, 0.7);
  assert.equal(report.lowQualityRate, 0.5);
  assert.equal(report.invalidCitationRate, 0.5);
  assert.equal(report.conflictRate, 0.5);
});

test("aggregateSearchQualityRows returns null averages when no evaluated rows exist", () => {
  const report = aggregateSearchQualityRows([]);

  assert.equal(report.evaluatedAnswers, 0);
  assert.equal(report.averageQualityScore, null);
  assert.equal(report.averageCitationCoverage, null);
  assert.equal(report.lowQualityRate, 0);
  assert.equal(report.invalidCitationRate, 0);
  assert.equal(report.conflictRate, 0);
});
