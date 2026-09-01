import test from "node:test";
import assert from "node:assert/strict";
import { createContent, CONTENT_KINDS, SOURCE_TYPES, REPRESENTATION_TYPES } from "../src/services/content/contentTypes.js";
import { processCsvContent } from "../src/services/content/processors/csvProcessor.js";
import { ContentError } from "../src/services/content/contentErrors.js";

test("CSV processor rejects content above the configured row limit", () => {
  const original = process.env.MAX_CSV_ROWS;
  process.env.MAX_CSV_ROWS = "2";

  try {
    const content = createContent({
      id: "csv:limit",
      kind: CONTENT_KINDS.FILE,
      source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F1" },
      original: { mimeType: "text/csv" },
      representations: [{
        type: REPRESENTATION_TYPES.BINARY,
        mimeType: "text/csv",
        data: Buffer.from("name,score\nA,1\nB,2\nC,3\n"),
      }],
    });

    assert.throws(
      () => processCsvContent(content),
      error => error instanceof ContentError && error.code === "CONTENT_TOO_LARGE",
    );
  } finally {
    if (original === undefined) delete process.env.MAX_CSV_ROWS;
    else process.env.MAX_CSV_ROWS = original;
  }
});
