import test from "node:test";
import assert from "node:assert/strict";
import { createBinaryRepresentation, createContent, CONTENT_KINDS, SOURCE_TYPES, REPRESENTATION_TYPES } from "../src/services/content/contentTypes.js";
import { processTextContent, isSupportedTextMimeType } from "../src/services/content/processors/textProcessor.js";
import { ContentError } from "../src/services/content/contentErrors.js";

test("text processor recognizes supported MIME types", () => {
  assert.equal(isSupportedTextMimeType("text/plain"), true);
  assert.equal(isSupportedTextMimeType("text/markdown"), true);
  assert.equal(isSupportedTextMimeType("application/json"), true);
  assert.equal(isSupportedTextMimeType("application/pdf"), false);
});

test("text processor converts binary data to UTF-8 text", () => {
  const content = createContent({
    id: "test:text",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F1" },
    original: { filename: "test.txt", mimeType: "text/plain", size: 6 },
    representations: [
      createBinaryRepresentation({
        mimeType: "text/plain",
        data: Buffer.from("hello\n"),
      }),
    ],
  });

  const processed = processTextContent(content);
  const text = processed.representations.find(r => r.type === REPRESENTATION_TYPES.TEXT);

  assert.ok(text);
  assert.equal(text.text, "hello\n");
  assert.equal(processed.metadata.processedAs, "text");
});

test("text processor reuses an existing text representation", () => {
  const content = createContent({
    id: "test:text-existing",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F2" },
    original: { filename: "test.md", mimeType: "text/markdown" },
    representations: [
      { type: REPRESENTATION_TYPES.TEXT, mimeType: "text/markdown", text: "# Hello" },
    ],
  });

  const processed = processTextContent(content);
  assert.strictEqual(processed, content);
});

test("text processor rejects unsupported MIME types", () => {
  const content = createContent({
    id: "test:pdf",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F3" },
    original: { filename: "test.pdf", mimeType: "application/pdf" },
    representations: [],
  });

  assert.throws(
    () => processTextContent(content),
    error => error instanceof ContentError && error.code === "UNSUPPORTED_MIME_TYPE",
  );
});
