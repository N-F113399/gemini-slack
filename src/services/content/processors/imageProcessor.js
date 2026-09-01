import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";

export const SUPPORTED_IMAGE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isSupportedImageMimeType(mimeType) {
  return SUPPORTED_IMAGE_MIME_TYPES.includes((mimeType || "").toLowerCase());
}

export function processImageContent(content) {
  if (!content?.original?.mimeType) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "Image MIME type is required");
  }

  if (!isSupportedImageMimeType(content.original.mimeType)) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
      `Unsupported image MIME type: ${content.original.mimeType}`,
    );
  }

  const binary = content.representations?.find(
    representation => representation.type === REPRESENTATION_TYPES.BINARY,
  );

  if (!binary?.data) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
      "Image binary representation is required",
    );
  }

  return {
    ...content,
    representations: [
      ...(content.representations || []),
      {
        type: "image",
        mimeType: binary.mimeType || content.original.mimeType,
        data: binary.data,
      },
    ],
    metadata: {
      ...(content.metadata || {}),
      processedAs: "image",
    },
  };
}
