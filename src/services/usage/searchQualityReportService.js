function normalizeDate(value, name) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid search quality report ${name} date`);
  return date;
}

function normalizeRange({ from = null, to = null } = {}) {
  const end = normalizeDate(to, "to") || new Date();
  const start = normalizeDate(from, "from") || new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (start > end) throw new RangeError("Search quality report start must not be after end");
  return { start, end };
}

export function aggregateSearchQualityRows(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array");

  const result = {
    evaluatedAnswers: 0,
    lowQualityAnswers: 0,
    invalidCitationAnswers: 0,
    conflictedAnswers: 0,
    qualityScoreTotal: 0,
    citationCoverageTotal: 0,
    citationCoverageSamples: 0,
  };

  for (const row of rows) {
    const metadata = row?.metadata || {};
    const quality = metadata.qualityEvaluation || metadata.qualityScore || metadata.quality || null;
    const citation = quality?.citationCoverage || metadata.citationCoverage || null;
    if (!quality && !citation) continue;

    result.evaluatedAnswers += 1;

    const score = Number(quality?.score);
    if (Number.isFinite(score)) result.qualityScoreTotal += score;
    if (quality?.lowQuality === true) result.lowQualityAnswers += 1;

    const flags = Array.isArray(quality?.flags) ? quality.flags : [];
    if (flags.includes("invalid_citation") || citation?.hasInvalidCitation === true) {
      result.invalidCitationAnswers += 1;
    }
    if (flags.includes("source_conflict") || Number(quality?.components?.conflict) < 1) {
      result.conflictedAnswers += 1;
    }

    const coverage = Number(citation?.coverageRatio);
    if (Number.isFinite(coverage)) {
      result.citationCoverageTotal += coverage;
      result.citationCoverageSamples += 1;
    }
  }

  return {
    evaluatedAnswers: result.evaluatedAnswers,
    lowQualityAnswers: result.lowQualityAnswers,
    invalidCitationAnswers: result.invalidCitationAnswers,
    conflictedAnswers: result.conflictedAnswers,
    averageQualityScore: result.evaluatedAnswers > 0 ? result.qualityScoreTotal / result.evaluatedAnswers : null,
    averageCitationCoverage: result.citationCoverageSamples > 0
      ? result.citationCoverageTotal / result.citationCoverageSamples
      : null,
    lowQualityRate: result.evaluatedAnswers > 0 ? result.lowQualityAnswers / result.evaluatedAnswers : 0,
    invalidCitationRate: result.evaluatedAnswers > 0 ? result.invalidCitationAnswers / result.evaluatedAnswers : 0,
    conflictRate: result.evaluatedAnswers > 0 ? result.conflictedAnswers / result.evaluatedAnswers : 0,
  };
}

export async function getSearchQualityReport({ from = null, to = null, dbClient = null } = {}) {
  const range = normalizeRange({ from, to });
  const supabase = dbClient || (await import("../db.js")).default;
  const { data, error } = await supabase
    .from("usage_events")
    .select("occurred_at,provider,service,operation,metadata")
    .eq("service", "gemini")
    .eq("operation", "generate")
    .eq("success", true)
    .gte("occurred_at", range.start.toISOString())
    .lte("occurred_at", range.end.toISOString())
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  return {
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    ...aggregateSearchQualityRows(data || []),
  };
}
