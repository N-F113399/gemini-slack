import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSearchQualityAlerts,
  SEARCH_QUALITY_MONITOR_DEFAULTS,
} from "../src/services/monitoring/searchQualityMonitor.js";

test("does not alert when there are no evaluated answers", () => {
  assert.deepEqual(evaluateSearchQualityAlerts({ report: { evaluatedAnswers: 0 } }), []);
});

test("alerts on low average quality score", () => {
  const alerts = evaluateSearchQualityAlerts({
    report: {
      evaluatedAnswers: 10,
      averageQualityScore: 0.4,
      invalidCitationRate: 0,
      conflictRate: 0,
    },
  });

  assert.deepEqual(alerts, [{
    type: "quality_score",
    service: "search",
    provider: "all",
    value: 0.4,
    threshold: SEARCH_QUALITY_MONITOR_DEFAULTS.qualityScoreThreshold,
  }]);
});

test("alerts on invalid citation and conflict rates", () => {
  const alerts = evaluateSearchQualityAlerts({
    report: {
      evaluatedAnswers: 10,
      averageQualityScore: 0.9,
      invalidCitationRate: 0.2,
      conflictRate: 0.3,
    },
  });

  assert.deepEqual(alerts.map(alert => alert.type), [
    "invalid_citation_rate",
    "conflict_rate",
  ]);
});
