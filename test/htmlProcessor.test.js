import test from "node:test";
import assert from "node:assert/strict";
import { createBinaryRepresentation, createContent, CONTENT_KINDS, SOURCE_TYPES } from "../src/services/content/contentTypes.js";
import { processHtmlContent, htmlToText } from "../src/services/content/processors/htmlProcessor.js";

test("htmlToText removes scripts and styles while preserving readable text", () => {
  const text = htmlToText("<h1>Title</h1><p>Hello <strong>world</strong>.</p><script>alert('x')</script><style>body{}</style>");
  assert.match(text, /Title/);
  assert.match(text, /Hello world/);
  assert.doesNotMatch(text, /alert/);
  assert.doesNotMatch(text, /body\{\}/);
});

test("processHtmlContent creates a text representation", () => {
  const content = createContent({
    id: "url:test",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com" },
    original: { mimeType: "text/html", size: 64 },
    representations: [createBinaryRepresentation({ data: Buffer.from("<p>Hello</p>"), mimeType: "text/html" })],
  });

  const processed = processHtmlContent(content);
  const text = processed.representations.find(representation => representation.type === "text");

  assert.equal(text.mimeType, "text/plain");
  assert.equal(text.text, "Hello");
  assert.equal(processed.metadata.processedAs, "html");
});
