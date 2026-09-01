const EXPLICIT_SEARCH_PATTERNS = [
  /^search\s*:?\s+(.+)$/i,
  /^search\s*:\s*(.+)$/i,
  /\b(search|look\s+up)\s+(the\s+)?web\b/i,
];

const SEARCH_TRIGGER_PATTERNS = [
  /\b(latest|current|recent|today|yesterday|breaking|news)\b/i,
  /(最新|現在|最新情報|ニュース|最近|調べて|検索して)/,
];

export function decideSearch(text = "") {
  if (typeof text !== "string") throw new TypeError("text must be a string");

  const trimmed = text.trim();
  for (const pattern of EXPLICIT_SEARCH_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const explicitQuery = pattern === EXPLICIT_SEARCH_PATTERNS[0] || pattern === EXPLICIT_SEARCH_PATTERNS[1]
        ? match[1]
        : trimmed;
      return Object.freeze({ shouldSearch: true, reason: "explicit", query: explicitQuery.trim() });
    }
  }

  if (SEARCH_TRIGGER_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return Object.freeze({ shouldSearch: true, reason: "trigger", query: trimmed });
  }

  return Object.freeze({ shouldSearch: false, reason: "none", query: null });
}
