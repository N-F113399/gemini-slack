import test from "node:test";
import assert from "node:assert/strict";
import { createContent, CONTENT_KINDS, SOURCE_TYPES, REPRESENTATION_TYPES } from "../src/services/content/contentTypes.js";
import { processImageContent, isSupportedImageMimeType } from "../src/services/content/processors/imageProcessor.js";
import { adaptContentToGeminiParts } from "../src/services/content/adapters/geminiContentAdapter.js";
import { ContentError } from "../src/services/content/contentErrors.js";

function createImage(mimeType = "image/png") {
  return createContent({
    id: "image:test",
    kind: CONTENT_KINDS.FILE,
    source: { type: SOURCE_TYPES.SLACK_FILE, ref: "F123" },
    original: { filename: "test.png", mimeType, size: 3 },
    representations: [
      { type: REPRESENTATION_TYPES.ORIGINAL, mimeType, size: 3 },
      { type: REPRESENTATION_TYPES.BINARY, mimeType, data: Buffer.from([1, 2, 3]) },
    ],
  });
}

test("image processor recognizes supported image MIME types", () => {
  assert.equal(isSupportedImageMimeType("image/png"), true);
  assert.equal(isSupportedImageMimeType("image/jpeg"), true);
  assert.equal(isSupportedImageMimeType("image/webp"), true);
  assert.equal(isSupportedImageMimeType("image/heic"), true);
  assert.equal(isSupportedImageMimeType("image/heif"), true);
  assert.equal(isSupportedImageMimeType("application/pdf"), false);
});

test("image processor preserves binary representation and marks content as image", () => {
  const processed = processImageContent(createImage());
  assert.equal(processed.metadata.processedAs, "image");
  assert.ok(processed.representations.some(rep => rep.type === "image"));
});

test("image processor rejects unsupported MIME types", () => {
  assert.throws(
    () => processImageContent(createImage("application/pdf")),
    error => error instanceof ContentError && error.code === "UNSUPPORTED_MIME_TYPE",
  );
});

test("Gemini adapter converts image binary data to inlineData", () => {
  const processed = processImageContent(createImage("image/png"));
  const parts = adaptContentToGeminiParts(processed);
  const imagePart = parts.find(part => part.inlineData);

  assert.deepEqual(imagePart, {
    inlineData: {
      mimeType: "image/png",
      data: "AQID",
    },
  });
});
