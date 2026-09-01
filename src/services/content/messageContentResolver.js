import { resolveSlackFiles } from "./slackFileResolver.js";
import { extractUrls, resolveUrl } from "./urlResolver.js";
import { processImageContent } from "./processors/imageProcessor.js";
import { processTextContent, isSupportedTextMimeType } from "./processors/textProcessor.js";
import { processPdfContent, isSupportedPdfMimeType } from "./processors/pdfProcessor.js";
import { processCsvContent, isSupportedCsvMimeType } from "./processors/csvProcessor.js";
import { processHtmlContent, isSupportedHtmlMimeType } from "./processors/htmlProcessor.js";
import { CONTENT_ERROR_CODES, ContentError } from "./contentErrors.js";

const DEFAULT_MAX_CONTENTS = 10;

function getMaxContents() {
  const value = Number(process.env.MAX_MESSAGE_CONTENTS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_CONTENTS;
}

function getFileMimeType(file) {
  return (file?.mimetype || file?.mime_type || "").toLowerCase();
}

export function isSupportedFile(file) {
  const mimeType = getFileMimeType(file);
  return mimeType.startsWith("image/")
    || isSupportedTextMimeType(mimeType)
    || isSupportedPdfMimeType(mimeType)
    || isSupportedCsvMimeType(mimeType);
}

function processResolvedContent(content) {
  const mimeType = (content.original?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return processImageContent(content);
  if (isSupportedTextMimeType(mimeType)) return processTextContent(content);
  if (isSupportedPdfMimeType(mimeType)) return processPdfContent(content);
  if (isSupportedCsvMimeType(mimeType)) return processCsvContent(content);
  if (isSupportedHtmlMimeType(mimeType)) return processHtmlContent(content);
  throw new ContentError(CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE, `Unsupported content MIME type: ${mimeType}`);
}

export async function resolveMessageContents({ files = [], text = "" } = {}) {
  if (!Array.isArray(files)) throw new TypeError("files must be an array");
  if (typeof text !== "string") throw new TypeError("text must be a string");

  const supportedFiles = files.filter(isSupportedFile);
  const unsupportedFiles = files.filter(file => !isSupportedFile(file));
  const urls = extractUrls(text);
  const maxContents = getMaxContents();

  if (supportedFiles.length + urls.length > maxContents) {
    throw new ContentError(
      CONTENT_ERROR_CODES.CONTENT_TOO_LARGE,
      `Too many contents. Maximum is ${maxContents}`,
      { fileCount: supportedFiles.length, urlCount: urls.length, maxContents },
    );
  }

  const [fileContents, urlContents] = await Promise.all([
    supportedFiles.length > 0
      ? resolveSlackFiles(supportedFiles).then(contents => contents.map(processResolvedContent))
      : [],
    urls.length > 0
      ? Promise.all(urls.map(resolveUrl)).then(contents => contents.map(processResolvedContent))
      : [],
  ]);

  return {
    contents: [...fileContents, ...urlContents],
    unsupportedFiles,
    fileCount: fileContents.length,
    urlCount: urlContents.length,
  };
}
