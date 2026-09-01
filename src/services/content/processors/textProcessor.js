import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";
import { truncateContentText } from "../contentLimits.js";

export const SUPPORTED_TEXT_MIME_TYPES = Object.freeze([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
  "application/xml",
  "text/xml",
]);

export function isSupportedTextMimeType(mimeType) {
  return SUPPORTED_TEXT_MIME_TYPES.includes((mimeType || "").toLowerCase());
}

export function processTextContent(content) {
  const mimeType = content?.original?.mimeType || "";
  if (!mimeType) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "Text MIME type is required");
  }

  if (!isSupportedTextMimeType(mimeType)) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
      `Unsupported text MIME type: ${mimeType}`,
    );
  }

  const existingText = content.representations?.find(
    representation => representation.type === REPRESENTATION_TYPES.TEXT && typeof representation.text === "string",
  );
  if (existingText) return content;

  const binary = content.representations?.find(
    representation => representation.type === REPRESENTATION_TYPES.BINARY && representation.data,
  );
  if (!binary) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
      "Text content requires a binary or text representation",
    );
  }

  const sourceText = Buffer.from(binary.data).toString("utf8");
  const normalized = truncateContentText(sourceText);

  return {
    ...content,
    representations: [
      ...(content.representations || []),
      {
        type: REPRESENTATION_TYPES.TEXT,
        mimeType,
        text: normalized.text,
        truncated: normalized.truncated,
        originalLength: normalized.originalLength,
      },
    ],
    metadata: {
      ...(content.metadata || {}),
      processedAs: "text",
      textTruncated: normalized.truncated,
    },
  };
}
