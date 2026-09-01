import fetch from "node-fetch";
import {
  createContent,
  createBinaryRepresentation,
  CONTENT_KINDS,
  SOURCE_TYPES,
  REPRESENTATION_TYPES,
} from "./contentTypes.js";
import { ContentError } from "./contentErrors.js";

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMaxFileSize() {
  return positiveNumber(process.env.MAX_SLACK_FILE_SIZE, DEFAULT_MAX_FILE_SIZE);
}

function getTimeoutMs() {
  return positiveNumber(process.env.SLACK_FILE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function getMimeType(file) {
  return file.mimetype || file.mime_type || "application/octet-stream";
}

export function validateSlackFile(file) {
  if (!file?.id) {
    throw new ContentError("INVALID_CONTENT", "Slack file id is required");
  }
  if (!file.url_private_download && !file.url_private) {
    throw new ContentError("INVALID_CONTENT", "Slack private download URL is required");
  }

  const size = Number(file.size);
  if (Number.isFinite(size) && size > getMaxFileSize()) {
    throw new ContentError("CONTENT_TOO_LARGE", `Slack file exceeds the ${getMaxFileSize()} byte limit`);
  }
}

async function readResponseBody(response, maxSize) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxSize) {
    throw new ContentError("CONTENT_TOO_LARGE", `Slack file exceeds the ${maxSize} byte limit`);
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxSize) {
      throw new ContentError("CONTENT_TOO_LARGE", `Slack file exceeds the ${maxSize} byte limit`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function downloadSlackFile(file) {
  validateSlackFile(file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  const url = file.url_private_download || file.url_private;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ContentError("INVALID_CONTENT", `Slack file download failed with status ${response.status}`);
    }

    const data = await readResponseBody(response, getMaxFileSize());
    return {
      data,
      mimeType: getMimeType(file),
      size: data.length,
    };
  } catch (err) {
    if (err instanceof ContentError) throw err;
    if (err.name === "AbortError") {
      throw new ContentError("URL_TIMEOUT", `Slack file download timed out after ${getTimeoutMs()}ms`);
    }
    throw new ContentError("INVALID_CONTENT", err.message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveSlackFile(file) {
  const downloaded = await downloadSlackFile(file);
  const mimeType = downloaded.mimeType;

  return createContent({
    id: `slack_file:${file.id}`,
    kind: CONTENT_KINDS.FILE,
    source: {
      type: SOURCE_TYPES.SLACK_FILE,
      ref: file.id,
    },
    original: {
      filename: file.name || null,
      mimeType,
      size: downloaded.size,
    },
    representations: [
      {
        type: REPRESENTATION_TYPES.ORIGINAL,
        mimeType,
        size: downloaded.size,
      },
      createBinaryRepresentation({
        data: downloaded.data,
        mimeType,
      }),
    ],
    metadata: {
      slackFileId: file.id,
      title: file.title || null,
    },
  });
}

export async function resolveSlackFiles(files = []) {
  if (!Array.isArray(files)) {
    throw new TypeError("Slack files must be an array");
  }
  return Promise.all(files.map(resolveSlackFile));
}
