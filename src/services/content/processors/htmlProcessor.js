import { REPRESENTATION_TYPES } from "../contentTypes.js";
import { CONTENT_ERROR_CODES, ContentError } from "../contentErrors.js";
import { getContentLimits, truncateTextAtBlockBoundary } from "../contentLimits.js";
import logger from "../../../utils/logger.js";

export const SUPPORTED_HTML_MIME_TYPES = Object.freeze(["text/html"]);

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);
const REMOVE_ELEMENTS = new Set([
  "script", "style", "noscript", "svg", "iframe", "form", "button",
  "input", "select", "textarea", "nav",
]);
const REMOVE_HINTS = /(?:^|[-_\s])(advert|advertisement|ads?|ad-container|cookie|cookie-banner|consent|breadcrumb|sidebar|social|share|related|recommend|pagination|menu|toolbar)(?:$|[-_\s])/i;
const BLOCK_ELEMENTS = new Set([
  "address", "article", "blockquote", "dd", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "ol", "p", "pre", "section", "table",
  "tr", "ul",
]);

export function isSupportedHtmlMimeType(mimeType) {
  return SUPPORTED_HTML_MIME_TYPES.includes((mimeType || "").toLowerCase());
}

function decodeCodePoint(value) {
  const codePoint = Number(value);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : "\uFFFD";
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(code))
    .replace(/&#x([\da-f]+);/gi, (_, code) => decodeCodePoint(parseInt(code, 16)));
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

/**
 * A small dependency-free HTML tree builder. It is deliberately limited to
 * static HTML extraction; it does not execute scripts or fetch subresources.
 */
function parseHtmlTree(html) {
  const root = { tag: "#root", attributes: {}, children: [] };
  const stack = [root];
  const source = html.replace(/<(script|style|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const tokens = source.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+|</gi) || [];

  for (const token of tokens) {
    if (token.startsWith("<!--") || /^<!/i.test(token)) continue;
    if (/^<\//.test(token)) {
      const tag = token.slice(2).match(/^\s*([\w:-]+)/)?.[1]?.toLowerCase();
      if (!tag) continue;
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    if (/^<[a-z]/i.test(token)) {
      const match = token.match(/^<([\w:-]+)([\s\S]*?)\/?\s*>$/);
      if (!match) continue;
      const tag = match[1].toLowerCase();
      const node = { tag, attributes: parseAttributes(match[2]), children: [] };
      stack[stack.length - 1].children.push(node);
      if (!VOID_ELEMENTS.has(tag) && !/\/\s*>$/.test(token)) stack.push(node);
      continue;
    }

    stack[stack.length - 1].children.push({ tag: "#text", text: token });
  }
  return root;
}

function hasRemovalHint(node) {
  const attributes = node.attributes || {};
  const role = (attributes.role || "").toLowerCase();
  if (role === "navigation" || role === "complementary" || attributes["aria-hidden"] === "true") return true;
  const hints = [attributes.id, attributes.class].filter(Boolean).join(" ");
  return REMOVE_HINTS.test(hints);
}

function removeUnwantedNodes(node) {
  node.children = (node.children || []).filter(child => {
    if (child.tag === "#text") return true;
    if (REMOVE_ELEMENTS.has(child.tag) || hasRemovalHint(child)) return false;
    removeUnwantedNodes(child);
    return true;
  });
}


function getNodeHintText(node) {
  const attributes = node.attributes || {};
  return [attributes.id, attributes.class].filter(Boolean).join(" ");
}

function createNodeStats() {
  return {
    textLength: 0,
    paragraphCount: 0,
    headingCount: 0,
    listCount: 0,
    tableCount: 0,
    codeCount: 0,
    linkCount: 0,
    boilerplateCount: 0,
    linkTextLength: 0,
  };
}

function mergeStats(target, source) {
  target.textLength += source.textLength;
  target.paragraphCount += source.paragraphCount;
  target.headingCount += source.headingCount;
  target.listCount += source.listCount;
  target.tableCount += source.tableCount;
  target.codeCount += source.codeCount;
  target.linkCount += source.linkCount;
  target.boilerplateCount += source.boilerplateCount;
  target.linkTextLength += source.linkTextLength;
  return target;
}

function collectCandidateStats(root) {
  const candidates = [];
  const statsByNode = new Map();

  function visit(node) {
    const stats = createNodeStats();

    for (const child of node.children || []) {
      if (child.tag === "#text") {
        stats.textLength += decodeHtmlEntities(child.text || "").trim().length;
        continue;
      }

      const childStats = visit(child);
      mergeStats(stats, childStats);

      if (child.tag === "p") stats.paragraphCount += 1;
      if (/^h[1-6]$/.test(child.tag)) stats.headingCount += 1;
      if (child.tag === "ul" || child.tag === "ol") stats.listCount += 1;
      if (child.tag === "table") stats.tableCount += 1;
      if (child.tag === "pre" || child.tag === "code") stats.codeCount += 1;
      if (child.tag === "a") {
        stats.linkCount += 1;
        stats.linkTextLength += childStats.textLength;
      }
      if (NEGATIVE_HINTS.test(getNodeHintText(child))) stats.boilerplateCount += 1;
    }

    statsByNode.set(node, stats);

    if (node.tag !== "#root") {
      const attributes = node.attributes || {};
      const role = (attributes.role || "").toLowerCase();
      const itemprop = (attributes.itemprop || "").toLowerCase();
      const hintText = getNodeHintText(node);

      if (
        itemprop === "articlebody"
        || node.tag === "main"
        || role === "main"
        || node.tag === "article"
        || POSITIVE_HINTS.test(hintText)
      ) {
        candidates.push(node);
      }
    }

    return stats;
  }

  const rootStats = visit(root);
  candidates.push(root);
  return { candidates, statsByNode, rootStats };
}

function scoreCandidate(node, stats) {
  const attributes = node.attributes || {};
  const role = (attributes.role || "").toLowerCase();
  const itemprop = (attributes.itemprop || "").toLowerCase();
  const hintText = getNodeHintText(node);
  let score = 0;

  if (itemprop === "articlebody") score += 100;
  if (node.tag === "main") score += 60;
  if (role === "main") score += 50;
  if (node.tag === "article") score += 40;
  if (POSITIVE_HINTS.test(hintText)) score += 20;
  if (NEGATIVE_HINTS.test(hintText)) score -= 40;

  if (stats.textLength >= 500) score += 10;
  if (stats.textLength >= 2000) score += 10;
  if (stats.textLength >= 10000) score += 10;
  score += Math.min(15, stats.paragraphCount);
  score += Math.min(10, stats.headingCount * 2);
  score += Math.min(15, stats.listCount + stats.tableCount * 2 + stats.codeCount * 2);

  const linkRatio = stats.textLength > 0 ? stats.linkTextLength / stats.textLength : 0;
  if (linkRatio > 0.75) score -= 40;
  else if (linkRatio > 0.5) score -= 20;

  score -= Math.min(30, stats.boilerplateCount * 5);

  return score;
}

function selectCandidate(root) {
  const { candidates, statsByNode } = collectCandidateStats(root);
  const uniqueCandidates = [...new Set(candidates)].filter(node => statsByNode.get(node)?.textLength > 0);

  let best = null;
  for (const candidate of uniqueCandidates) {
    const stats = statsByNode.get(candidate);
    const score = scoreCandidate(candidate, stats);
    const method = candidate.attributes?.itemprop?.toLowerCase() === "articlebody"
      ? "itemprop_articleBody"
      : candidate.tag === "main"
        ? "main"
        : candidate.attributes?.role?.toLowerCase() === "main"
          ? "role_main"
          : candidate.tag === "article"
            ? "article"
            : candidate.tag === "#root"
              ? "body_fallback"
              : "scored_candidate";

    if (!best || score > best.score || (score === best.score && stats.textLength > best.stats.textLength)) {
      best = { candidate, score, method, stats };
    }
  }

  return {
    candidate: best?.candidate || root,
    score: best?.score ?? 0,
    method: best?.method || "body_fallback",
    stats: best?.stats || createNodeStats(),
    candidateCount: uniqueCandidates.length,
  };
}

function extractNodeText(node, maxLength = Infinity) {
  let output = "";
  let truncated = false;
  const codeFence = String.fromCharCode(96).repeat(3);

  function append(value) {
    if (!value || truncated) return;
    const remaining = maxLength - output.length;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    if (value.length <= remaining) {
      output += value;
      return;
    }
    output += value.slice(0, remaining);
    truncated = true;
  }

  function visit(current) {
    if (truncated) return;
    if (current.tag === "#text") {
      append(decodeHtmlEntities(current.text || ""));
      return;
    }
    if (current.tag === "br" || current.tag === "hr") {
      append("\\n");
      return;
    }

    const childTextStart = output.length;
    for (const child of current.children || []) {
      visit(child);
      if (truncated) break;
    }
    const childText = output.slice(childTextStart);

    if (current.tag === "pre") append("\\n" + codeFence + "\\n" + childText.trim() + "\\n" + codeFence + "\\n");
    else if (current.tag === "li") append("\\n- " + childText.trim() + "\\n");
    else if (/^h[1-6]$/.test(current.tag)) append("\\n\\n" + "#".repeat(Number(current.tag[1])) + " " + childText.trim() + "\\n\\n");
    else if (current.tag === "th" || current.tag === "td") append(" | " + childText.trim());
    else if (current.tag === "tr") append(childText + "\\n");
    else if (BLOCK_ELEMENTS.has(current.tag)) append("\\n" + childText.trim() + "\\n");
  }

  visit(node);
  return { text: output, truncated };
}

function normalizeExtractedText(text) {
  return text
    .replace(/[\\t\\f\\v ]+/g, " ")
    .replace(/ *\\n */g, "\\n")
    .replace(/\\n{3,}/g, "\\n\\n")
    .replace(/\\n\\s*\\|/g, "\\n|")
    .trim();
}

function extractReadableText(html) {
  const phaseStartedAt = Date.now();

  const parseStartedAt = Date.now();
  const root = parseHtmlTree(html);
  const parseTimeMs = Date.now() - parseStartedAt;

  const cleanupStartedAt = Date.now();
  removeUnwantedNodes(root);
  const cleanupTimeMs = Date.now() - cleanupStartedAt;

  const selectionStartedAt = Date.now();
  const selected = selectCandidate(root);
  const selectionTimeMs = Date.now() - selectionStartedAt;

  const maxLength = getContentLimits().maxUrlHtmlTextLength;
  const extractionStartedAt = Date.now();
  const extracted = extractNodeText(selected.candidate, maxLength);
  const textExtractionTimeMs = Date.now() - extractionStartedAt;

  const normalizationStartedAt = Date.now();
  const text = normalizeExtractedText(extracted.text);
  const normalizationTimeMs = Date.now() - normalizationStartedAt;

  return {
    text,
    method: selected.method,
    candidateCount: selected.candidateCount,
    selectedCandidate: selected.method,
    selectedCandidateScore: selected.score,
    extractedTextLength: selected.stats.textLength,
    truncated: extracted.truncated || selected.stats.textLength > text.length,
    parseTimeMs,
    cleanupTimeMs,
    selectionTimeMs,
    textExtractionTimeMs,
    normalizationTimeMs,
    totalProcessingTimeMs: Date.now() - phaseStartedAt,
  };
}

export function htmlToText(html) {
  if (typeof html !== "string") throw new TypeError("HTML must be a string");
  return extractReadableText(html).text;
}

export function processHtmlContent(content) {
  const startedAt = Date.now();
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

  const htmlBuffer = Buffer.from(binary.data);
  const html = htmlBuffer.toString("utf8");
  const extracted = extractReadableText(html);
  if (!extracted.text) {
    throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, "HTML page contains no readable text");
  }

  const { maxUrlHtmlTextLength } = getContentLimits();
  const truncationStartedAt = Date.now();
  const normalized = truncateTextAtBlockBoundary(extracted.text, maxUrlHtmlTextLength);
  const truncationTimeMs = Date.now() - truncationStartedAt;
  const processingTimeMs = Date.now() - startedAt;
  const originalHtmlBytes = content.original?.size ?? htmlBuffer.length;

  logger.info(
    `HTML content extracted: originalHtmlBytes=${originalHtmlBytes} candidateCount=${extracted.candidateCount} selectedCandidate=${extracted.selectedCandidate} selectedCandidateScore=${extracted.selectedCandidateScore} extractedTextLength=${extracted.extractedTextLength} finalTextLength=${normalized.text.length} truncated=${normalized.truncated} extractionMethod=${extracted.method} parseTimeMs=${extracted.parseTimeMs} cleanupTimeMs=${extracted.cleanupTimeMs} selectionTimeMs=${extracted.selectionTimeMs} textExtractionTimeMs=${extracted.textExtractionTimeMs} normalizationTimeMs=${extracted.normalizationTimeMs} truncationTimeMs=${truncationTimeMs} totalProcessingTimeMs=${processingTimeMs}`,
  );

  return {
    ...content,
    representations: [
      ...(content.representations || []),
      {
        type: REPRESENTATION_TYPES.TEXT,
        mimeType: "text/plain",
        text: normalized.text,
        truncated: normalized.truncated,
        originalLength: normalized.originalLength,
      },
    ],
    metadata: {
      ...(content.metadata || {}),
      processedAs: "html",
      textTruncated: normalized.truncated,
      originalHtmlBytes,
      extractedTextLength: extracted.extractedTextLength,
      finalTextLength: normalized.text.length,
      extractionMethod: extracted.method,
      candidateCount: extracted.candidateCount,
      selectedCandidate: extracted.selectedCandidate,
      selectedCandidateScore: extracted.selectedCandidateScore,
      htmlProcessingTimeMs: processingTimeMs,
      parseTimeMs: extracted.parseTimeMs,
      cleanupTimeMs: extracted.cleanupTimeMs,
      selectionTimeMs: extracted.selectionTimeMs,
      textExtractionTimeMs: extracted.textExtractionTimeMs,
      normalizationTimeMs: extracted.normalizationTimeMs,
      truncationTimeMs,
      totalProcessingTimeMs: processingTimeMs,
    },
  };
}
