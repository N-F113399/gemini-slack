import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_VERSION,
  CONTENT_KINDS,
  SOURCE_TYPES,
  REPRESENTATION_TYPES,
  createContent,
  createTextRepresentation,
  createBinaryRepresentation,
} from "../src/services/content/contentTypes.js";

test("createContent builds an immutable versioned content object", () => {
  const representation = createTextRepresentation({ text: "hello" });
  const content = createContent({
    id: "content-1",
    kind: CONTENT_KINDS.REMOTE,
    source: { type: SOURCE_TYPES.URL, ref: "https://example.com" },
    original: { mimeType: "text/html" },
    representations: [representation],
    metadata: { custom: "value" },
  });

  assert.equal(content.version, CONTENT_VERSION);
  assert.equal(content.id, "content-1");
  assert.equal(content.kind, "remote");
  assert.equal(content.source.type, "url");
  assert.equal(content.representations[0].type, REPRESENTATION_TYPES.TEXT);
  assert.equal(content.representations[0].text, "hello");
  assert.equal(content.metadata.custom, "value");
  assert.throws(() => { content.id = "changed"; }, TypeError);
});

test("createContent validates required fields", () => {
  assert.throws(() => createContent({}), /Content id is required/);
  assert.throws(() => createContent({ id: "1" }), /Content kind is required/);
  assert.throws(() => createContent({ id: "1", kind: "file" }), /source\.type is required/);
  assert.throws(
    () => createContent({ id: "1", kind: "file", source: { type: "slack_file" }, representations: {} }),
    /representations must be an array/,
  );
});

test("representation factories validate and preserve extension fields", () => {
  const text = createTextRepresentation({ text: "abc", language: "en" });
  assert.equal(text.type, "text");
  assert.equal(text.language, "en");

  const binary = createBinaryRepresentation({ data: Buffer.from("abc"), mimeType: "image/png", width: 100 });
  assert.equal(binary.type, "binary");
  assert.equal(binary.mimeType, "image/png");
  assert.equal(binary.width, 100);
});

test("createTextRepresentation rejects non-string text", () => {
  assert.throws(() => createTextRepresentation({ text: 123 }), /requires a string/);
});

test("createBinaryRepresentation requires data and mimeType", () => {
  assert.throws(() => createBinaryRepresentation({ mimeType: "image/png" }), /requires data/);
  assert.throws(() => createBinaryRepresentation({ data: Buffer.from("x") }), /requires mimeType/);
});
