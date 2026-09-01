import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";

const DIRECT_BINARY_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

function selectGeminiRepresentation(content) {
  const representations = content?.representations || [];

  const structured = representations.find(
    representation => representation.type === REPRESENTATION_TYPES.STRUCTURED && representation.rows,
  );
  if (structured) {
    return { text: JSON.stringify({ schema: structured.schema, rows: structured.rows }) };
  }

  const text = representations.find(
    representation => representation.type === REPRESENTATION_TYPES.TEXT && typeof representation.text === "string",
  );
  if (text) {
    return { text: text.text };
  }

  const binary = representations.find(
    representation => representation.type === REPRESENTATION_TYPES.BINARY
      && representation.data
      && DIRECT_BINARY_MIME_TYPES.has((representation.mimeType || "").toLowerCase()),
  );
  if (binary) {
    return {
      inlineData: {
        mimeType: binary.mimeType,
        data: Buffer.from(binary.data).toString("base64"),
      },
    };
  }

  return null;
}

export function adaptContentToGeminiParts(content) {
  const part = selectGeminiRepresentation(content);

  if (!part) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
      `No Gemini-compatible representation found for content ${content?.id || "unknown"}`,
    );
  }

  return [part];
}

export function adaptContentsToGeminiParts(contents = []) {
  if (!Array.isArray(contents)) {
    throw new TypeError("contents must be an array");
  }

  return contents.flatMap(adaptContentToGeminiParts);
}
