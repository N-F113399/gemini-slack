export const CONTENT_VERSION = 1;

export const CONTENT_KINDS = Object.freeze({
  TEXT: "text",
  FILE: "file",
  REMOTE: "remote",
});

export const SOURCE_TYPES = Object.freeze({
  TEXT: "text",
  SLACK_FILE: "slack_file",
  URL: "url",
  STORAGE: "storage",
});

export const REPRESENTATION_TYPES = Object.freeze({
  ORIGINAL: "original",
  TEXT: "text",
  BINARY: "binary",
  STRUCTURED: "structured",
});

export const CAPABILITIES = Object.freeze({
  TEXT: "text",
  VISION: "vision",
  STRUCTURED: "structured",
  NATIVE: "native",
});

export function createContent({
  id,
  kind,
  source,
  original = {},
  representations = [],
  metadata = {},
}) {
  if (!id) throw new TypeError("Content id is required");
  if (!kind) throw new TypeError("Content kind is required");
  if (!source?.type) throw new TypeError("Content source.type is required");
  if (!Array.isArray(representations)) {
    throw new TypeError("Content representations must be an array");
  }

  return Object.freeze({
    version: CONTENT_VERSION,
    id,
    kind,
    source: Object.freeze({ ...source }),
    original: Object.freeze({ ...original }),
    representations: Object.freeze(
      representations.map((representation) => Object.freeze({ ...representation })),
    ),
    metadata: Object.freeze({ ...metadata }),
  });
}

export function createTextRepresentation({ text, mimeType = "text/plain", ...extra }) {
  if (typeof text !== "string") throw new TypeError("Text representation requires a string");
  return {
    type: REPRESENTATION_TYPES.TEXT,
    mimeType,
    text,
    ...extra,
  };
}

export function createBinaryRepresentation({ data, mimeType, ...extra }) {
  if (data == null) throw new TypeError("Binary representation requires data");
  if (!mimeType) throw new TypeError("Binary representation requires mimeType");
  return {
    type: REPRESENTATION_TYPES.BINARY,
    mimeType,
    data,
    ...extra,
  };
}
