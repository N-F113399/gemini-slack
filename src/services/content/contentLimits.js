const DEFAULTS = Object.freeze({
  maxMessageContents: 10,
  maxSlackFileSize: 10 * 1024 * 1024,
  slackFileTimeoutMs: 10_000,
  maxUrlResponseSize: 10 * 1024 * 1024,
  urlTimeoutMs: 10_000,
  maxTextLength: 200_000,
  maxUrlHtmlTextLength: 30_000,
  maxTotalUrlHtmlTextLength: 50_000,
  maxCsvRows: 10_000,
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getContentLimits() {
  return Object.freeze({
    maxMessageContents: positiveInteger(process.env.MAX_MESSAGE_CONTENTS, DEFAULTS.maxMessageContents),
    maxSlackFileSize: positiveInteger(process.env.MAX_SLACK_FILE_SIZE, DEFAULTS.maxSlackFileSize),
    slackFileTimeoutMs: positiveInteger(process.env.SLACK_FILE_TIMEOUT_MS, DEFAULTS.slackFileTimeoutMs),
    maxUrlResponseSize: positiveInteger(process.env.MAX_URL_RESPONSE_SIZE, DEFAULTS.maxUrlResponseSize),
    urlTimeoutMs: positiveInteger(process.env.URL_TIMEOUT_MS, DEFAULTS.urlTimeoutMs),
    maxTextLength: positiveInteger(process.env.MAX_CONTENT_TEXT_LENGTH, DEFAULTS.maxTextLength),
    maxUrlHtmlTextLength: positiveInteger(process.env.MAX_URL_HTML_TEXT_LENGTH, DEFAULTS.maxUrlHtmlTextLength),
    maxTotalUrlHtmlTextLength: positiveInteger(process.env.MAX_TOTAL_URL_HTML_TEXT_LENGTH, DEFAULTS.maxTotalUrlHtmlTextLength),
    maxCsvRows: positiveInteger(process.env.MAX_CSV_ROWS, DEFAULTS.maxCsvRows),
  });
}

export function truncateContentText(text, maxLength = getContentLimits().maxTextLength) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  if (text.length <= maxLength) return { text, truncated: false, originalLength: text.length };
  return {
    text: text.slice(0, maxLength),
    truncated: true,
    originalLength: text.length,
  };
}

/**
 * Truncate at a paragraph/block boundary where possible.
 * If the first block alone exceeds the limit, truncate that block to guarantee
 * the returned text never exceeds maxLength.
 */
export function truncateTextAtBlockBoundary(text, maxLength) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  if (!Number.isInteger(maxLength) || maxLength < 0) throw new TypeError("maxLength must be a non-negative integer");
  if (text.length <= maxLength) {
    return { text, truncated: false, originalLength: text.length };
  }
  if (maxLength === 0) {
    return { text: "", truncated: true, originalLength: text.length };
  }

  const prefix = text.slice(0, maxLength);
  const boundary = prefix.lastIndexOf("\n\n");
  const truncatedText = boundary > 0 ? prefix.slice(0, boundary).trimEnd() : prefix.trimEnd();
  return {
    text: truncatedText || prefix,
    truncated: true,
    originalLength: text.length,
  };
}
