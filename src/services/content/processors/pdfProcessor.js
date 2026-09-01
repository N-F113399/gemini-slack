import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";

export const SUPPORTED_PDF_MIME_TYPES = Object.freeze([
  "application/pdf",
]);

export function isSupportedPdfMimeType(mimeType) {
  return SUPPORTED_PDF_MIME_TYPES.includes((mimeType || "").toLowerCase());
}

export function processPdfContent(content) {
  const mimeType = content?.original?.mimeType || "";

  if (!mimeType) {
    throw new ContentError(
      CONTENT_ERROR_CODES.INVALID_CONTENT,
      "PDF MIME type is required",
    );
  }

  if (!isSupportedPdfMimeType(mimeType)) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
      `Unsupported PDF MIME type: ${mimeType}`,
    );
  }

  const binary = content.representations?.find(
    representation => representation.type === REPRESENTATION_TYPES.BINARY && representation.data,
  );

  if (!binary) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
      "PDF binary representation is required",
    );
  }

  const hasOriginal = content.representations?.some(
    representation => representation.type === REPRESENTATION_TYPES.ORIGINAL,
  );

  if (hasOriginal) {
    return {
      ...content,
      metadata: {
        ...(content.metadata || {}),
        processedAs: "pdf",
      },
    };
  }

  return {
    ...content,
    representations: [
      ...(content.representations || []),
      {
        type: REPRESENTATION_TYPES.ORIGINAL,
        mimeType,
        size: content.original.size ?? binary.data.length,
      },
    ],
    metadata: {
      ...(content.metadata || {}),
      processedAs: "pdf",
    },
  };
}
