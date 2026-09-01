import test from "node:test";
import assert from "node:assert/strict";
import { adaptContentToGeminiParts, adaptContentsToGeminiParts } from "../src/services/content/adapters/geminiContentAdapter.js";
import { CONTENT_KINDS, SOURCE_TYPES, REPRESENTATION_TYPES, createContent } from "../src/services/content/contentTypes.js";

test("adapter selects text over raw HTML binary", () => {
  const content = createContent({
    id: "url:example",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com" },
    original: { mimeType: "text/html" },
    representations: [
      { type: REPRESENTATION_TYPES.ORIGINAL, mimeType: "text/html" },
      { type: REPRESENTATION_TYPES.BINARY, mimeType: "text/html", data: Buffer.from("<html></html>") },
      { type: REPRESENTATION_TYPES.TEXT, mimeType: "text/plain", text: "Hello world" },
    ],
  });

  assert.deepEqual(adaptContentToGeminiParts(content), [{ text: "Hello world" }]);
});

test("adapter preserves every content when multiple contents are supplied", () => {
  const image = createContent({
    id: "image:1",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F1" },
    original: { mimeType: "image/png" },
    representations: [
      { type: REPRESENTATION_TYPES.BINARY, mimeType: "image/png", data: Buffer.from("image") },
    ],
  });
  const page = createContent({
    id: "url:1",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com" },
    original: { mimeType: "text/html" },
    representations: [
      { type: REPRESENTATION_TYPES.BINARY, mimeType: "text/html", data: Buffer.from("html") },
      { type: REPRESENTATION_TYPES.TEXT, mimeType: "text/plain", text: "Page text" },
    ],
  });

  const parts = adaptContentsToGeminiParts([image, page]);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].inlineData.mimeType, "image/png");
  assert.equal(parts[1].text, "Page text");
});
