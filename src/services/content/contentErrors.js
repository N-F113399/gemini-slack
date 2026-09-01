export const CONTENT_ERROR_CODES = Object.freeze({
  INVALID_CONTENT: "INVALID_CONTENT",
  UNSUPPORTED_SOURCE: "UNSUPPORTED_SOURCE",
  UNSUPPORTED_REPRESENTATION: "UNSUPPORTED_REPRESENTATION",
  UNSUPPORTED_MIME_TYPE: "UNSUPPORTED_MIME_TYPE",
  CONTENT_TOO_LARGE: "CONTENT_TOO_LARGE",
  CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  URL_BLOCKED: "URL_BLOCKED",
  URL_TIMEOUT: "URL_TIMEOUT",
  URL_RESPONSE_TOO_LARGE: "URL_RESPONSE_TOO_LARGE",
});

export class ContentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ContentError";
    this.code = code;
    this.details = details;
  }
}

export function contentError(code, message, details = {}) {
  return new ContentError(code, message, details);
}
