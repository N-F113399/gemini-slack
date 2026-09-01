const CITATION_PATTERN = /\[S(\d+)\]/g;

function normalizeSourceIds(sourceIds = []) {
  return new Set(
    sourceIds
      .map((value) => String(value).match(/^S?(\d+)$/i)?.[1])
      .filter(Boolean)
      .map((value) => Number(value)),
  );
}

export function evaluateCitationCoverage(answer, sourceCount) {
  if (typeof answer !== "string") throw new TypeError("answer must be a string");
  if (!Number.isInteger(sourceCount) || sourceCount < 0) {
    throw new TypeError("sourceCount must be a non-negative integer");
  }

  const citedSourceIds = [];
  for (const match of answer.matchAll(CITATION_PATTERN)) {
    citedSourceIds.push(Number(match[1]));
  }

  const uniqueCitedSourceIds = [...new Set(citedSourceIds)].sort((a, b) => a - b);
  const validSourceIds = normalizeSourceIds(
    Array.from({ length: sourceCount }, (_, index) => index + 1),
  );
  const invalidCitations = uniqueCitedSourceIds.filter((id) => !validSourceIds.has(id));
  const validCitations = uniqueCitedSourceIds.filter((id) => validSourceIds.has(id));

  return {
    sourceCount,
    citedSourceIds: uniqueCitedSourceIds,
    validCitations,
    invalidCitations,
    citationCount: citedSourceIds.length,
    uniqueCitationCount: uniqueCitedSourceIds.length,
    coverageRatio: sourceCount === 0 ? null : validCitations.length / sourceCount,
    hasInvalidCitation: invalidCitations.length > 0,
    hasCitation: validCitations.length > 0,
  };
}
