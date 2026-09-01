import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";

export class GeminiInputAdapter {
  adapt(_contents, _context = {}) {
    throw new Error("GeminiInputAdapter.adapt() must be implemented");
  }
}

/**
 * Convert application Content objects into Gemini generateContent parts.
 * The adapter is intentionally isolated from Slack and file-resolution logic.
 */
export class DefaultGeminiInputAdapter extends GeminiInputAdapter {
  adapt(contents = [], _context = {}) {
    if (!Array.isArray(contents)) {
      throw new TypeError("Contents must be an array");
    }

    return contents.flatMap((content) => {
      if (!content?.representations) {
        throw new ContentError(
          CONTENT_ERROR_CODES.INVALID_CONTENT,
          "Content representations are required",
        );
      }

      const image = content.representations.find(
        representation => representation.type === "image",
      );

      if (image) {
        if (!image.data || !image.mimeType) {
          throw new ContentError(
            CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
            "Image representation requires data and mimeType",
          );
        }

        return [{
          inlineData: {
            mimeType: image.mimeType,
            data: Buffer.isBuffer(image.data)
              ? image.data.toString("base64")
              : String(image.data),
          },
        }];
      }

      const text = content.representations.find(
        representation => representation.type === REPRESENTATION_TYPES.TEXT,
      );

      if (text) {
        return [{ text: text.text }];
      }

      throw new ContentError(
        CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
        `No Gemini-compatible representation found for content ${content.id}`,
      );
    });
  }
}
