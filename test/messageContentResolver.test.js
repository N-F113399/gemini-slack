import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedFile } from "../src/services/content/messageContentResolver.js";

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
