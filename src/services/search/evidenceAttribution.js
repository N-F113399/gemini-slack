export function buildEvidenceAttribution(selection) {
  if (!selection || !Array.isArray(selection.items)) {
    throw new TypeError("selection.items must be an array");
  }

  return selection.items.map((item, index) => ({
    sourceId: `S${index + 1}`,
    title: item.source?.title || item.source?.url || `Source ${index + 1}`,
    url: item.source?.url || null,
    provider: item.source?.provider || null,
    evidence: Array.isArray(item.evidence) ? item.evidence.map(part => part.text).filter(Boolean) : [],
  }));
}

export function buildAttributionInstruction() {
  return [
    "When answering from web search evidence, cite the supporting source IDs in square brackets, for example [S1] or [S1][S3].",
    "Only cite source IDs that actually appear in the provided evidence.",
    "If the provided sources conflict, do not hide the conflict; state it and cite the relevant sources.",
    "If a claim is not supported by the provided evidence, do not fabricate a citation.",
  ].join("\n");
}
