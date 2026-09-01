import test from "node:test";
import assert from "node:assert/strict";
import { getContentLimits, truncateContentText } from "../src/services/content/contentLimits.js";

test("getContentLimits returns safe defaults", () => {
  const original = process.env.MAX_MESSAGE_CONTENTS;
  delete process.env.MAX_MESSAGE_CONTENTS;
  const limits = getContentLimits();
  assert.equal(limits.maxMessageContents, 10);
  if (original !== undefined) process.env.MAX_MESSAGE_CONTENTS = original;
});

test("getContentLimits ignores invalid environment values", () => {
  const original = process.env.MAX_CONTENT_TEXT_LENGTH;
  process.env.MAX_CONTENT_TEXT_LENGTH = "-1";
  assert.equal(getContentLimits().maxTextLength, 200_000);
  if (original === undefined) delete process.env.MAX_CONTENT_TEXT_LENGTH;
  else process.env.MAX_CONTENT_TEXT_LENGTH = original;
});

test("truncateContentText marks truncated content", () => {
  assert.deepEqual(truncateContentText("abcdefgh", 5), {
    text: "abcde",
    truncated: true,
    originalLength: 8,
  });
});

test("truncateContentText preserves short content", () => {
  assert.deepEqual(truncateContentText("abc", 5), {
    text: "abc",
    truncated: false,
    originalLength: 3,
  });
});
