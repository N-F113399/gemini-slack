const EXPLICIT_SEARCH_PATTERNS = [
  /^search\s*:?\s+(.+)$/i,
  /^search\s*:\s*(.+)$/i,
  /^web\s+search\s*:?\s+(.+)$/i,
  /^look\s+up\s+(?:the\s+)?web\s*:?\s*(.+)$/i,
];

const FRESHNESS_PATTERNS = [
  /\b(latest|current|recent|today|yesterday|breaking|this\s+(?:week|month|year))\b/i,
  /(最新|現在|最新情報|ニュース|最近|今週|今月|今年|今日|昨日)/,
  /(直近|最新の動向|最新の状況)/,
];

const RESEARCH_INTENT_PATTERNS = [
  /\b(search|look\s+up|find|research|check)\b.*\b(web|online|internet)\b/i,
  /\b(search|look\s+up|find|research|check)\b/i,
  /(調べて|検索して|探して|確認して|リサーチして)/,
];

const VOLATILE_INFORMATION_PATTERNS = [
  /\b(price|pricing|cost|stock|share|exchange\s+rate|weather|schedule|availability)\b/i,
  /(価格|料金|相場|株価|為替|天気|営業時間|空席|予約状況|開催情報)/,
];

function explicitSearch(text) {
  for (const pattern of EXPLICIT_SEARCH_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const query = (match[1] || text).trim();
      if (query) return query;
    }
  }
  return null;
}

export function decideSearch(text = "") {
  if (typeof text !== "string") throw new TypeError("text must be a string");

  const trimmed = text.trim();
  if (!trimmed) {
    return Object.freeze({ shouldSearch: false, reason: "empty", query: null });
  }

  const explicitQuery = explicitSearch(trimmed);
  if (explicitQuery) {
    return Object.freeze({
      shouldSearch: true,
      reason: "explicit",
      query: explicitQuery,
    });
  }

  if (FRESHNESS_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return Object.freeze({
      shouldSearch: true,
      reason: "freshness",
      query: trimmed,
    });
  }

  if (VOLATILE_INFORMATION_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return Object.freeze({
      shouldSearch: true,
      reason: "volatile_information",
      query: trimmed,
    });
  }

  if (RESEARCH_INTENT_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return Object.freeze({
      shouldSearch: true,
      reason: "research_intent",
      query: trimmed,
    });
  }

  return Object.freeze({ shouldSearch: false, reason: "none", query: null });
}
