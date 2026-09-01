export function buildEvidenceAttribution(selection) {
  if (!selection || !Array.isArray(selection.items)) {
    throw new TypeError("selection.items must be an array");
  }

  return selection.items.map((item, index) => ({
    sourceId: `S${index + 1}`,
    title: item.source?.title || item.source?.url || `Source ${index + 1}`,
    url: item.source?.url || null,
    index: index + 1,
  }));
}

export function buildAttributionInstruction() {
  return [
    "Use [S1], [S2], etc. when citing the provided web evidence.",
    "Only cite source IDs that are present in the provided evidence.",
    "Do not invent source IDs or citations.",
    "When sources conflict, explicitly describe the conflict rather than hiding it.",
  ].join("\n");
}
