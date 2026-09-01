const DEFAULT_QUALITY_SCORE_THRESHOLD = 0.6;
const DEFAULT_INVALID_CITATION_RATE_THRESHOLD = 0.1;
const DEFAULT_CONFLICT_RATE_THRESHOLD = 0.2;

function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function evaluateSearchQualityAlerts({ report = {} } = {}) {
  const evaluatedAnswers = Number(report.evaluatedAnswers) || 0;
  if (evaluatedAnswers === 0) return [];

  const qualityThreshold = readNumber(
    "USAGE_ALERT_QUALITY_SCORE",
    DEFAULT_QUALITY_SCORE_THRESHOLD,
  );
  const invalidCitationThreshold = readNumber(
    "USAGE_ALERT_INVALID_CITATION_RATE",
    DEFAULT_INVALID_CITATION_RATE_THRESHOLD,
  );
  const conflictThreshold = readNumber(
    "USAGE_ALERT_CONFLICT_RATE",
    DEFAULT_CONFLICT_RATE_THRESHOLD,
  );

  const alerts = [];
  const averageQualityScore = Number(report.averageQualityScore);
  const invalidCitationRate = Number(report.invalidCitationRate);
  const conflictRate = Number(report.conflictRate);

  if (Number.isFinite(averageQualityScore) && averageQualityScore <= qualityThreshold) {
    alerts.push({
      type: "quality_score",
      service: "search",
      provider: "all",
      value: averageQualityScore,
      threshold: qualityThreshold,
    });
  }

  if (Number.isFinite(invalidCitationRate) && invalidCitationRate >= invalidCitationThreshold) {
    alerts.push({
      type: "invalid_citation_rate",
      service: "search",
      provider: "all",
      value: invalidCitationRate,
      threshold: invalidCitationThreshold,
    });
  }

  if (Number.isFinite(conflictRate) && conflictRate >= conflictThreshold) {
    alerts.push({
      type: "conflict_rate",
      service: "search",
      provider: "all",
      value: conflictRate,
      threshold: conflictThreshold,
    });
  }

  return alerts;
}

export const SEARCH_QUALITY_MONITOR_DEFAULTS = Object.freeze({
  qualityScoreThreshold: DEFAULT_QUALITY_SCORE_THRESHOLD,
  invalidCitationRateThreshold: DEFAULT_INVALID_CITATION_RATE_THRESHOLD,
  conflictRateThreshold: DEFAULT_CONFLICT_RATE_THRESHOLD,
});
