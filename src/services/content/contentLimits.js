const DEFAULTS = Object.freeze({
  maxMessageContents: 10,
  maxSlackFileSize: 10 * 1024 * 1024,
  slackFileTimeoutMs: 10_000,
  maxUrlResponseSize: 10 * 1024 * 1024,
  urlTimeoutMs: 10_000,
  maxTextLength: 200_000,
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
