import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import fetch from "node-fetch";
import {
  createContent,
  createBinaryRepresentation,
  CONTENT_KINDS,
  SOURCE_TYPES,
  REPRESENTATION_TYPES,
} from "./contentTypes.js";
import { ContentError, CONTENT_ERROR_CODES } from "./contentErrors.js";
import logger from "../../utils/logger.js";

const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const ALLOWED_MIME_TYPES = new Set([
  "text/html",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
  "application/xml",
  "text/xml",
  "text/csv",
  "application/csv",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMaxResponseSize() {
  return positiveNumber(process.env.MAX_URL_RESPONSE_SIZE, DEFAULT_MAX_RESPONSE_SIZE);
}

function getTimeoutMs() {
  return positiveNumber(process.env.URL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function normalizeMimeType(value) {
  return String(value || "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
}

function ipv4ToNumber(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256) + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function isPrivateIpv4(address) {
  const value = ipv4ToNumber(address);
  if (value === null) return false;
  const inRange = (start, end) => value >= start && value <= end;
  return inRange(0x00000000, 0x00ffffff)
    || inRange(0x0a000000, 0x0affffff)
    || inRange(0x64400000, 0x647fffff)
    || inRange(0x7f000000, 0x7fffffff)
    || inRange(0xa9fe0000, 0xa9feffff)
    || inRange(0xac100000, 0xac1fffff)
    || inRange(0xc0a80000, 0xc0a8ffff)
    || inRange(0xc0000000, 0xc00000ff)
    || inRange(0xc0000200, 0xc00002ff)
    || inRange(0xc6336400, 0xc63364ff)
    || inRange(0xcb007100, 0xcb0071ff)
    || inRange(0xe0000000, 0xffffffff);
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    return net.isIP(mapped) === 4 && isPrivateIpv4(mapped);
  }
  return false;
}

export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return false;
}

export function selectPreferredAddress(records) {
  const ipv4 = records.find(record => record.family === 4);
  return ipv4 || records.find(record => record.family === 6) || null;
}

function formatDnsRecords(records) {
  return records.map(record => `${record.address}/IPv${record.family}`).join(", ");
}

async function resolvePublicAddress(hostname) {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some(record => isBlockedAddress(record.address))) {
    throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "URL resolves to a private or local network address");
  }
  return records;
}

function createSafeAgent(protocol, hostname) {
  const Agent = protocol === "https:" ? https.Agent : http.Agent;
  return new Agent({
    keepAlive: false,
    lookup: (host, options, callback) => {
      dns.lookup(host, { all: true, verbatim: true }, (err, records) => {
        if (err) return callback(err);
        if (records.length === 0 || records.some(record => isBlockedAddress(record.address))) {
          return callback(new Error("URL resolves to a private or local network address"));
        }
        const selected = selectPreferredAddress(records);
        if (!selected) {
          return callback(new Error("No usable public network address found"));
        }
        callback(null, selected.address, selected.family);
      });
    },
    ...(protocol === "https:" ? { servername: hostname } : {}),
  });
}

export async function validateUrlTarget(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "Invalid URL");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "Only http and https URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "URLs with embedded credentials are not allowed");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "Local hostnames are not allowed");
  }

  const literalFamily = net.isIP(hostname);
  if (literalFamily && isBlockedAddress(hostname)) {
    throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "Private or local network addresses are not allowed");
  }

  if (!literalFamily) {
    try {
      await resolvePublicAddress(hostname);
    } catch (err) {
      if (err instanceof ContentError) throw err;
      throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, `DNS resolution failed: ${err.message}`);
    }
  }

  return parsed;
}

async function readResponseBody(response, maxSize) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxSize) {
    throw new ContentError(CONTENT_ERROR_CODES.URL_RESPONSE_TOO_LARGE, `URL response exceeds the ${maxSize} byte limit`);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxSize) {
      throw new ContentError(CONTENT_ERROR_CODES.URL_RESPONSE_TOO_LARGE, `URL response exceeds the ${maxSize} byte limit`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function fetchUrlContent(rawUrl, options = {}) {
  let currentUrl = rawUrl;
  const maxResponseSize = options.maxResponseSize || getMaxResponseSize();
  const timeoutMs = options.timeoutMs || getTimeoutMs();

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const parsedUrl = await validateUrlTarget(currentUrl);
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const literalFamily = net.isIP(hostname);
    const dnsRecords = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await dns.lookup(hostname, { all: true, verbatim: true });
    const selectedAddress = selectPreferredAddress(dnsRecords);
    const startedAt = Date.now();

    logger.info(
      `URL fetch started: host=${hostname} protocol=${parsedUrl.protocol} timeoutMs=${timeoutMs} addresses=[${formatDnsRecords(dnsRecords)}] selected=${selectedAddress ? `${selectedAddress.address}/IPv${selectedAddress.family}` : "none"} redirectCount=${redirectCount}`,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "gemini-slack-bot/1.0" },
        agent: createSafeAgent(parsedUrl.protocol, hostname),
        signal: controller.signal,
      });

      logger.info(
        `URL response received: host=${hostname} status=${response.status} elapsedMs=${Date.now() - startedAt}`,
      );

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "Redirect response has no location");
        if (redirectCount === MAX_REDIRECTS) throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "Too many redirects");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, `URL request failed with status ${response.status}`);
      }

      const mimeType = normalizeMimeType(response.headers.get("content-type"));
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new ContentError(CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE, `Unsupported URL content type: ${mimeType}`);
      }

      const data = await readResponseBody(response, maxResponseSize);
      logger.info(
        `URL fetch completed: host=${hostname} status=${response.status} mimeType=${mimeType} size=${data.length} elapsedMs=${Date.now() - startedAt} finalUrl=${currentUrl}`,
      );
      return { data, mimeType, size: data.length, finalUrl: currentUrl };
    } catch (err) {
      if (err instanceof ContentError) throw err;

      const errorDetails = {
        name: err?.name,
        code: err?.code,
        type: err?.type,
        cause: err?.cause
          ? {
              name: err.cause.name,
              code: err.cause.code,
              message: err.cause.message,
            }
          : undefined,
        elapsedMs: Date.now() - startedAt,
      };

      if (err.name === "AbortError") {
        logger.warn(
          `URL fetch timed out: host=${hostname} protocol=${parsedUrl.protocol} elapsedMs=${errorDetails.elapsedMs} timeoutMs=${timeoutMs} selected=${selectedAddress ? `${selectedAddress.address}/IPv${selectedAddress.family}` : "none"} error=${JSON.stringify(errorDetails)}`,
        );
        throw new ContentError(
          CONTENT_ERROR_CODES.URL_TIMEOUT,
          `URL request timed out after ${timeoutMs}ms`,
          errorDetails,
        );
      }

      logger.error(
        `URL fetch failed: host=${hostname} protocol=${parsedUrl.protocol} elapsedMs=${errorDetails.elapsedMs} selected=${selectedAddress ? `${selectedAddress.address}/IPv${selectedAddress.family}` : "none"} error=${JSON.stringify(errorDetails)}`,
      );
      throw new ContentError(CONTENT_ERROR_CODES.INVALID_CONTENT, err.message, errorDetails);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ContentError(CONTENT_ERROR_CODES.URL_BLOCKED, "URL request could not be completed");
}
export async function resolveUrl(rawUrl) {
  const result = await fetchUrlContent(rawUrl);
  return createContent({
    id: `url:${result.finalUrl}`,
    kind: CONTENT_KINDS.REMOTE,
    source: {
      type: SOURCE_TYPES.URL,
      ref: rawUrl,
      url: rawUrl,
    },
    original: {
      mimeType: result.mimeType,
      size: result.size,
      url: result.finalUrl,
    },
    representations: [
      {
        type: REPRESENTATION_TYPES.ORIGINAL,
        mimeType: result.mimeType,
        size: result.size,
      },
      createBinaryRepresentation({ data: result.data, mimeType: result.mimeType }),
    ],
    metadata: {
      originalUrl: rawUrl,
      finalUrl: result.finalUrl,
      retrievedAt: new Date().toISOString(),
    },
  });
}

export function extractUrls(text = "") {
  if (typeof text !== "string") return [];
  const matches = text.match(/https?:\/\/[^\s<>|]+/gi) || [];
  return [...new Set(matches.map(url => url.replace(/[),.!?;:'\"]+$/, "")))];
}
