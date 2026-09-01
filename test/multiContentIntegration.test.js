import test from "node:test";
import assert from "node:assert/strict";
import { adaptContentsToGeminiParts } from "../src/services/content/adapters/geminiContentAdapter.js";
import { createContent, CONTENT_KINDS, SOURCE_TYPES, REPRESENTATION_TYPES } from "../src/services/content/contentTypes.js";

test("adaptContentsToGeminiParts preserves one part per heterogeneous content", () => {
  const image = createContent({
    id: "image:1",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F1" },
    original: { mimeType: "image/png", size: 3 },
    representations: [{ type: REPRESENTATION_TYPES.BINARY, mimeType: "image/png", data: Buffer.from([1, 2, 3]) }],
  });
  const page = createContent({
    id: "url:1",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com" },
    original: { mimeType: "text/html", size: 3 },
    representations: [{ type: REPRESENTATION_TYPES.TEXT, mimeType: "text/plain", text: "page content" }],
  });

  const parts = adaptContentsToGeminiParts([image, page]);
  assert.equal(parts.length, 2);
  assert.ok(parts[0].inlineData);
  assert.equal(parts[1].text, "page content");
});

test("adaptContentsToGeminiParts preserves content order", () => {
  const first = createContent({
    id: "1",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://one.example" },
    representations: [{ type: REPRESENTATION_TYPES.TEXT, mimeType: "text/plain", text: "one" }],
  });
  const second = createContent({
    id: "2",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://two.example" },
    representations: [{ type: REPRESENTATION_TYPES.TEXT, mimeType: "text/plain", text: "two" }],
  });

  const parts = adaptContentsToGeminiParts([first, second]);
  assert.deepEqual(parts.map(part => part.text), ["one", "two"]);
});
