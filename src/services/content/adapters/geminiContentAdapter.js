import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";

export function adaptContentToGeminiParts(content) {
  const parts = [];

  for (const representation of content?.representations || []) {
    if (representation.type === REPRESENTATION_TYPES.BINARY && representation.data) {
      parts.push({
        inlineData: {
          mimeType: representation.mimeType,
          data: Buffer.from(representation.data).toString("base64"),
        },
      });
    }

    if (representation.type === REPRESENTATION_TYPES.TEXT && typeof representation.text === "string") {
      parts.push({ text: representation.text });
    }
  }

  if (parts.length === 0) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
      `No Gemini-compatible representation found for content ${content?.id || "unknown"}`,
    );
  }

  return parts;
}

export function adaptContentsToGeminiParts(contents = []) {
  if (!Array.isArray(contents)) {
    throw new TypeError("contents must be an array");
  }

  return contents.flatMap(adaptContentToGeminiParts);
}
