import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedFile, limitUrlHtmlContents } from "../src/services/content/messageContentResolver.js";

test("isSupportedFile recognizes the supported content families", () => {
  assert.equal(isSupportedFile({ mimetype: "image/png" }), true);
  assert.equal(isSupportedFile({ mimetype: "application/pdf" }), true);
  assert.equal(isSupportedFile({ mimetype: "text/plain" }), true);
  assert.equal(isSupportedFile({ mimetype: "application/xml" }), true);
  assert.equal(isSupportedFile({ mimetype: "text/csv" }), true);
});

test("isSupportedFile rejects unsupported content types", () => {
  assert.equal(isSupportedFile({ mimetype: "application/zip" }), false);
  assert.equal(isSupportedFile({ mimetype: "application/x-msdownload" }), false);
});

test("limitUrlHtmlContents caps aggregate URL HTML text and preserves other content", () => {
  const contents = [
    {
      source: { type: "url" },
      metadata: { processedAs: "html" },
      representations: [{ type: "text", text: "one\n\ntwo\n\nthree", originalLength: 15 }],
    },
    {
      source: { type: "url" },
      metadata: { processedAs: "html" },
      representations: [{ type: "text", text: "second content", originalLength: 14 }],
    },
    {
      source: { type: "slack_file" },
      metadata: { processedAs: "text" },
      representations: [{ type: "text", text: "attachment text" }],
    },
  ];
  const limited = limitUrlHtmlContents(contents, 7);
  const totalLength = limited.slice(0, 2).reduce((sum, content) => sum + content.representations[0].text.length, 0);
  assert.equal(totalLength, 7);
  assert.equal(limited[0].metadata.urlAggregateTruncated, true);
  assert.equal(limited[1].metadata.urlAggregateTruncated, true);
  assert.equal(limited[2], contents[2]);
});
