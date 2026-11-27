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

test("htmlToText prefers the main content and removes navigation and boilerplate", () => {
  const html = `<html><body>
    <nav>Top navigation</nav>
    <aside class="sidebar">Sidebar links</aside>
    <main><h1>Article title</h1><p>Main body text.</p><pre>const answer = 42;</pre></main>
    <footer>Footer links</footer>
  </body></html>`;
  const text = htmlToText(html);
  assert.match(text, /Article title/);
  assert.match(text, /Main body text/);
  assert.match(text, /const answer = 42/);
  assert.doesNotMatch(text, /Top navigation|Sidebar links|Footer links/);
});

test("htmlToText falls back to body text when no semantic main element exists", () => {
  const text = htmlToText("<div><h2>Fallback heading</h2><p>Fallback body.</p></div>");
  assert.match(text, /Fallback heading/);
  assert.match(text, /Fallback body/);
});

test("processHtmlContent creates a text representation with extraction metadata", () => {
  const content = createContent({
    id: "url:test",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com" },
    original: { mimeType: "text/html", size: 64 },
    representations: [createBinaryRepresentation({ data: Buffer.from("<main><p>Hello</p></main>"), mimeType: "text/html" })],
  });

  const processed = processHtmlContent(content);
  const text = processed.representations.find(representation => representation.type === "text");

  assert.equal(text.mimeType, "text/plain");
  assert.equal(text.text, "Hello");
  assert.equal(processed.metadata.processedAs, "html");
  assert.equal(processed.metadata.extractionMethod, "main");
  assert.equal(processed.metadata.originalHtmlBytes, 64);
});

test("processHtmlContent applies the URL HTML text limit", () => {
  const original = process.env.MAX_URL_HTML_TEXT_LENGTH;
  process.env.MAX_URL_HTML_TEXT_LENGTH = "12";
  try {
    const content = createContent({
      id: "url:long",
      kind: CONTENT_KINDS.REMOTE,
      source: { type: SOURCE_TYPES.URL, ref: "https://example.com" },
      original: { mimeType: "text/html" },
      representations: [createBinaryRepresentation({ data: Buffer.from("<main><p>First block.</p><p>Second block.</p></main>"), mimeType: "text/html" })],
    });
    const processed = processHtmlContent(content);
    const text = processed.representations.find(representation => representation.type === "text");
    assert.ok(text.text.length <= 12);
    assert.equal(text.truncated, true);
  } finally {
    if (original === undefined) delete process.env.MAX_URL_HTML_TEXT_LENGTH;
    else process.env.MAX_URL_HTML_TEXT_LENGTH = original;
  }
});


test("htmlToText prefers articleBody and removes semantic and hinted boilerplate", () => {
  const html = `<body>
    <div class="cookie-banner">Accept cookies</div>
    <div class="advertisement">Ad content</div>
    <header>Article header</header>
    <div itemprop="articleBody">
      <h2>Article heading</h2>
      <p>Important article content.</p>
      <ul><li>First item</li><li>Second item</li></ul>
    </div>
    <div role="complementary">Related links</div>
  </body>`;
  const text = htmlToText(html);
  assert.match(text, /Article heading/);
  assert.match(text, /Important article content/);
  assert.match(text, /- First item/);
  assert.match(text, /- Second item/);
  assert.doesNotMatch(text, /Accept cookies|Ad content|Related links/);
});

test("htmlToText preserves table row and cell structure", () => {
  const text = htmlToText(`
    <main>
      <table>
        <tr><th>Name</th><th>Value</th></tr>
        <tr><td>foo</td><td>bar</td></tr>
      </table>
    </main>
  `);
  assert.match(text, /\| Name\| Value/);
  assert.match(text, /\| foo\| bar/);
});

test("limitUrlHtmlContents applies the aggregate URL text limit", async () => {
  const { limitUrlHtmlContents } = await import("../src/services/content/messageContentResolver.js");
  const first = createContent({
    id: "url:first",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com/first" },
    original: { mimeType: "text/html" },
    representations: [{ type: "text", mimeType: "text/plain", text: "First URL content." }],
    metadata: { processedAs: "html" },
  });
  const second = createContent({
    id: "url:second",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com/second" },
    original: { mimeType: "text/html" },
    representations: [{ type: "text", mimeType: "text/plain", text: "Second URL content." }],
    metadata: { processedAs: "html" },
  });

  const limited = limitUrlHtmlContents([first, second], 20);
  const firstText = limited[0].representations.find(r => r.type === "text").text;
  const secondText = limited[1].representations.find(r => r.type === "text").text;

  assert.equal(firstText, "First URL content.");
  assert.equal(secondText.length <= 2, true);
  assert.equal(limited[1].metadata.urlAggregateTruncated, true);
});
