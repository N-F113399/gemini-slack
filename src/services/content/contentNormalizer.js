import { CONTENT_VERSION, createContent } from "./contentTypes.js";

export function normalizeContent(content) {
  if (!content || typeof content !== "object") {
    throw new TypeError("Content must be an object");
  }

  const normalized = createContent({
    id: content.id,
    kind: content.kind,
    source: content.source,
    original: content.original,
    representations: content.representations,
    metadata: content.metadata,
  });

  return {
    ...normalized,
    version: CONTENT_VERSION,
  };
}
