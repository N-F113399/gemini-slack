const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_EVIDENCE_CHARS = 4000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getEvidenceCandidates(result) {
  const evidence = result?.evidence || {};
  const candidates = [];

  for (const highlight of Array.isArray(evidence.highlights) ? evidence.highlights : []) {
    const text = normalizeText(highlight);
    if (text) candidates.push({ type: "highlight", text, priority: 1 });
  }

  for (const snippet of Array.isArray(evidence.snippets) ? evidence.snippets : []) {
    const text = normalizeText(snippet);
    if (text) candidates.push({ type: "snippet", text, priority: 2 });
  }

  const snippet = normalizeText(evidence.snippet);
  if (snippet) candidates.push({ type: "snippet", text: snippet, priority: 2 });

  const description = normalizeText(evidence.description);
  if (description) candidates.push({ type: "description", text: description, priority: 3 });

  const summary = normalizeText(evidence.summary);
  if (summary) candidates.push({ type: "summary", text: summary, priority: 3 });

  const fullText = normalizeText(evidence.text);
  if (fullText) candidates.push({ type: "text", text: fullText, priority: 4 });

  return candidates.sort((a, b) => a.priority - b.priority);
}

export function selectEvidence(searchResponse, {
  maxResults = DEFAULT_MAX_RESULTS,
  maxEvidenceChars = DEFAULT_MAX_EVIDENCE_CHARS,
} = {}) {
  if (!searchResponse || !Array.isArray(searchResponse.results)) {
    throw new TypeError("searchResponse.results must be an array");
  }
  if (!Number.isInteger(maxResults) || maxResults <= 0) {
    throw new TypeError("maxResults must be a positive integer");
  }
  if (!Number.isInteger(maxEvidenceChars) || maxEvidenceChars <= 0) {
    throw new TypeError("maxEvidenceChars must be a positive integer");
  }

  const selected = [];
  let totalChars = 0;
  const seenUrls = new Set();

  const ranked = [...searchResponse.results].sort((a, b) => {
    const aPosition = Number.isInteger(a?.ranking?.position) ? a.ranking.position : Number.MAX_SAFE_INTEGER;
    const bPosition = Number.isInteger(b?.ranking?.position) ? b.ranking.position : Number.MAX_SAFE_INTEGER;
    if (aPosition !== bPosition) return aPosition - bPosition;
    return (b?.ranking?.score ?? -Infinity) - (a?.ranking?.score ?? -Infinity);
  });

  for (const result of ranked) {
    if (selected.length >= maxResults) break;
    const url = result?.source?.url || null;
    if (url && seenUrls.has(url)) continue;

    const candidates = getEvidenceCandidates(result);
    if (candidates.length === 0) continue;

    const pieces = [];
    let resultChars = 0;
    for (const candidate of candidates) {
      if (totalChars + resultChars >= maxEvidenceChars) break;
      const remaining = maxEvidenceChars - totalChars - resultChars;
      const text = candidate.text.length > remaining
        ? candidate.text.slice(0, remaining)
        : candidate.text;
      if (!text) continue;
      pieces.push({ type: candidate.type, text });
      resultChars += text.length;
      if (candidate.type === "text") break;
    }

    if (pieces.length === 0) continue;

    selected.push({
      result,
      evidence: pieces,
      source: result.source,
      ranking: result.ranking,
    });
    if (url) seenUrls.add(url);
    totalChars += resultChars;
  }

  return {
    items: selected,
    totalChars,
    resultCount: selected.length,
  };
}

export function buildSelectedEvidenceText(selection) {
  if (!selection || !Array.isArray(selection.items)) {
    throw new TypeError("selection.items must be an array");
  }

  return selection.items.map((item, index) => {
    const title = item.source?.title || item.source?.url || `Source ${index + 1}`;
    const url = item.source?.url || "";
    const evidence = item.evidence.map(part => part.text).join("\n\n");
    return `[Web Source ${index + 1}]\nTitle: ${title}\nURL: ${url}\n${evidence}`;
  }).join("\n\n");
}

export { DEFAULT_MAX_RESULTS, DEFAULT_MAX_EVIDENCE_CHARS };