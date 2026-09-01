import test from "node:test";
import assert from "node:assert/strict";
import { processPdfContent, isSupportedPdfMimeType } from "../src/services/content/processors/pdfProcessor.js";
import { createContent, createBinaryRepresentation, CONTENT_KINDS, SOURCE_TYPES } from "../src/services/content/contentTypes.js";
import { ContentError, CONTENT_ERROR_CODES } from "../src/services/content/contentErrors.js";

test("isSupportedPdfMimeType accepts application/pdf", () => {
  assert.equal(isSupportedPdfMimeType("application/pdf"), true);
  assert.equal(isSupportedPdfMimeType("application/PDF"), true);
});

test("processPdfContent accepts a PDF with a binary representation", () => {
  const content = createContent({
    id: "slack_file:F123",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F123" },
    original: { filename: "sample.pdf", mimeType: "application/pdf", size: 5 },
    representations: [
      createBinaryRepresentation({ data: Buffer.from("%PDF-"), mimeType: "application/pdf" }),
    ],
  });

  const processed = processPdfContent(content);
  assert.equal(processed.metadata.processedAs, "pdf");
});

test("processPdfContent rejects unsupported MIME types", () => {
  const content = createContent({
    id: "text:1",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F123" },
    original: { mimeType: "text/plain", size: 4 },
    representations: [createBinaryRepresentation({ data: Buffer.from("test"), mimeType: "text/plain" })],
  });

  assert.throws(
    () => processPdfContent(content),
    error => error instanceof ContentError && error.code === CONTENT_ERROR_CODES.UNSUPPORTED_MIME_TYPE,
  );
});

test("processPdfContent requires a binary representation", () => {
  const content = createContent({
    id: "slack_file:F123",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F123" },
    original: { mimeType: "application/pdf", size: 5 },
    representations: [],
  });

  assert.throws(
    () => processPdfContent(content),
    error => error instanceof ContentError && error.code === CONTENT_ERROR_CODES.UNSUPPORTED_REPRESENTATION,
  );
});
