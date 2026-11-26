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
const REMOVE_HINTS = /(?:^|[-_\s])(advert|ads|cookie|consent|breadcrumb|sidebar|social|share|related|recommend|pagination|menu|toolbar)(?:$|[-_\s])/i;
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

function textLength(node) {
  if (node.tag === "#text") return decodeHtmlEntities(node.text || "").trim().length;
  return (node.children || []).reduce((sum, child) => sum + textLength(child), 0);
}

function findFirst(node, predicate) {
  for (const child of node.children || []) {
    if (child.tag !== "#text" && predicate(child)) return child;
  }
  for (const child of node.children || []) {
    if (child.tag !== "#text") {
      const found = findFirst(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function findLargest(node, predicate) {
  const matches = [];
  const visit = current => {
    for (const child of current.children || []) {
      if (child.tag === "#text") continue;
      if (predicate(child)) matches.push(child);
      visit(child);
    }
  };
  visit(node);
  return matches.sort((a, b) => textLength(b) - textLength(a))[0] || null;
}

function extractNodeText(node, depth = 0) {
  if (node.tag === "#text") return decodeHtmlEntities(node.text || "");
  if (node.tag === "br" || node.tag === "hr") return "\n";
  const childText = (node.children || []).map(child => extractNodeText(child, depth + 1)).join("");
  if (node.tag === "pre") return `\n\`\`\`\n${childText.trim()}\n\`\`\`\n`;
  if (node.tag === "li") return `\n- ${childText.trim()}\n`;
  if (/^h[1-6]$/.test(node.tag)) return `\n\n${"#".repeat(Number(node.tag[1]))} ${childText.trim()}\n\n`;
  if (node.tag === "th" || node.tag === "td") return ` | ${childText.trim()}`;
  if (node.tag === "tr") return `${childText}\n`;
  if (BLOCK_ELEMENTS.has(node.tag)) return `\n${childText.trim()}\n`;
  return childText;
}

function normalizeExtractedText(text) {
  return text
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\s*\|/g, "\n|")
    .trim();
}

function extractReadableText(html) {
  const root = parseHtmlTree(html);
  removeUnwantedNodes(root);

  const articleBody = findFirst(root, node => node.attributes?.itemprop === "articleBody");
  const main = findFirst(root, node => node.tag === "main");
  const roleMain = findFirst(root, node => node.attributes?.role === "main");
  const article = findLargest(root, node => node.tag === "article");
  const candidates = [
    [articleBody, "article"],
    [main, "main"],
    [roleMain, "role_main"],
    [article, "article"],
    [root, "body_fallback"],
  ];

  for (const [candidate, method] of candidates) {
    if (!candidate || textLength(candidate) === 0) continue;
    const text = normalizeExtractedText(extractNodeText(candidate));
    if (text) return { text, method };
  }
  return { text: "", method: "body_fallback" };
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
  const normalized = truncateTextAtBlockBoundary(extracted.text, maxUrlHtmlTextLength);
  const processingTimeMs = Date.now() - startedAt;
  const originalHtmlBytes = content.original?.size ?? htmlBuffer.length;

  logger.info(
    `HTML content extracted: originalHtmlBytes=${originalHtmlBytes} extractedTextLength=${extracted.text.length} finalTextLength=${normalized.text.length} truncated=${normalized.truncated} extractionMethod=${extracted.method} processingTimeMs=${processingTimeMs}`,
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
      extractedTextLength: extracted.text.length,
      finalTextLength: normalized.text.length,
      extractionMethod: extracted.method,
      htmlProcessingTimeMs: processingTimeMs,
    },
  };
}
