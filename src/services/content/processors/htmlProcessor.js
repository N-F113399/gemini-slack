import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";

export const SUPPORTED_HTML_MIME_TYPES = Object.freeze(["text/html"]);

export function isSupportedHtmlMimeType(mimeType) {
  return SUPPORTED_HTML_MIME_TYPES.includes((mimeType || "").toLowerCase());
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToText(html) {
  if (typeof html !== "string") throw new TypeError("HTML must be a string");
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>(?=\s*)/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export function processHtmlContent(content) {
  const mimeType = (content?.original?.mimeType || "").toLowerCase();
  if (!mimeType) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "HTML MIME type is required");
  }
  if (!isSupportedHtmlMimeType(mimeType)) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
      `Unsupported HTML MIME type: ${mimeType}`,
    );
  }

  const binary = content.representations?.find(
    representation => representation.type === REPRESENTATION_TYPES.BINARY && representation.data,
  );
  if (!binary) {
    throw new ContentError(
      CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
      "HTML content requires a binary representation",
    );
  }

  const html = Buffer.from(binary.data).toString("utf8");
  const text = htmlToText(html);
  if (!text) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "HTML page contains no readable text");
  }

  return {
    ...content,
    representations: [
      ...(content.representations || []),
      {
        type: REPRESENTATION_TYPES.TEXT,
        mimeType: "text/plain",
        text,
      },
    ],
    metadata: {
      ...(content.metadata || {}),
      processedAs: "html",
    },
  };
}
