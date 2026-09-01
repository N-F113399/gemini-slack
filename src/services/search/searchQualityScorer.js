const DEFAULT_WEIGHTS = Object.freeze({
  citation: 0.5,
  sourceQuality: 0.3,
  conflict: 0.2,
});

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSourceQuality(evaluatedSources = []) {
  if (evaluatedSources.length === 0) return null;
  const maxPossible = Math.max(...evaluatedSources.map(item => Number(item.qualityScore) || 0), 1);
  const average = evaluatedSources.reduce((sum, item) => sum + (Number(item.qualityScore) || 0), 0) / evaluatedSources.length;
  return clamp(average / maxPossible);
}

export function scoreSearchAnswer({
  citationCoverage,
  evaluatedSources = [],
  conflicts = [],
  weights = DEFAULT_WEIGHTS,
} = {}) {
  if (!citationCoverage || typeof citationCoverage !== "object") {
    throw new TypeError("citationCoverage is required");
  }
  if (!Array.isArray(evaluatedSources) || !Array.isArray(conflicts)) {
    throw new TypeError("evaluatedSources and conflicts must be arrays");
  }

  const citationScore = citationCoverage.sourceCount === 0
    ? 1
    : clamp(Number(citationCoverage.coverageRatio ?? 0));
  const sourceQualityScore = normalizeSourceQuality(evaluatedSources) ?? 0;
  const conflictScore = conflicts.length === 0 ? 1 : clamp(1 - Math.min(conflicts.length / Math.max(evaluatedSources.length, 1), 1));

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
  const score = clamp(
    (citationScore * Number(weights.citation || 0)
      + sourceQualityScore * Number(weights.sourceQuality || 0)
      + conflictScore * Number(weights.conflict || 0)) / totalWeight,
  );

  const flags = [];
  if (citationCoverage.hasInvalidCitation) flags.push("invalid_citation");
  if (citationCoverage.coverageRatio != null && citationCoverage.coverageRatio < 0.5) flags.push("low_citation_coverage");
  if (conflicts.length > 0) flags.push("source_conflict");

  return {
    score,
    components: {
      citation: citationScore,
      sourceQuality: sourceQualityScore,
      conflict: conflictScore,
    },
    flags,
    lowQuality: score < 0.6 || flags.includes("invalid_citation"),
  };
}

export { DEFAULT_WEIGHTS };
