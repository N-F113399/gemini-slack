import { createContent, createTextRepresentation, CONTENT_KINDS, SOURCE_TYPES } from "../content/contentTypes.js";

function collectEvidence(result) {
  const evidence = result?.evidence || {};
  const sections = [];

  if (evidence.description) sections.push(`Description:\n${evidence.description}`);
  if (Array.isArray(evidence.highlights) && evidence.highlights.length > 0) {
    sections.push(`Highlights:\n${evidence.highlights.join("\n")}`);
  }
  if (Array.isArray(evidence.snippets) && evidence.snippets.length > 0) {
    sections.push(`Snippets:\n${evidence.snippets.join("\n")}`);
  }
  if (evidence.snippet) sections.push(`Snippet:\n${evidence.snippet}`);
  if (evidence.summary) sections.push(`Summary:\n${evidence.summary}`);
  if (evidence.text) sections.push(`Content:\n${evidence.text}`);

  return sections.join("\n\n").trim();
}

export function searchResultToContent(result, { index = 0 } = {}) {
  if (!result?.source?.url) {
    throw new TypeError("Search result source.url is required");
  }

  const text = collectEvidence(result);
  if (!text) return null;

  return createContent({
    id: `search:${result.source.provider || "unknown"}:${result.id || index}`,
    kind: CONTENT_KINDS.REMOTE,
    source: {
      type: SOURCE_TYPES.URL,
      ref: result.source.url,
    },
    original: {
      mimeType: "text/plain",
      title: result.source.title || null,
    },
    representations: [
      createTextRepresentation({
        text,
        mimeType: "text/plain",
      }),
    ],
    metadata: {
      sourceType: result.source.type || null,
      provider: result.source.provider || null,
      title: result.source.title || null,
      domain: result.source.domain || null,
      ranking: result.ranking || {},
      publication: result.publication || {},
      media: result.media || {},
      searchResultId: result.id || null,
    },
  });
}

export function searchResponseToContents(searchResponse, { maxResults = null } = {}) {
  const results = Array.isArray(searchResponse?.results) ? searchResponse.results : [];
  const limited = Number.isInteger(maxResults) && maxResults > 0
    ? results.slice(0, maxResults)
    : results;

  return limited
    .map((result, index) => searchResultToContent(result, { index }))
    .filter(Boolean);
}

export function buildSearchContextText(searchResponse, { maxResults = null } = {}) {
  const contents = searchResponseToContents(searchResponse, { maxResults });
  return contents.map((content, index) => {
    const title = content.metadata.title || content.source.ref;
    const body = content.representations[0].text;
    return `[Web Source ${index + 1}]\nTitle: ${title}\nURL: ${content.source.ref}\n${body}`;
  }).join("\n\n");
}
