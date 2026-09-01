import test from "node:test";
import assert from "node:assert/strict";
import { extractUrls, isBlockedAddress, validateUrlTarget } from "../src/services/content/urlResolver.js";
import { ContentError } from "../src/services/content/contentErrors.js";

test("extractUrls extracts unique http and https URLs", () => {
  assert.deepEqual(
    extractUrls("See https://example.com/a and https://example.com/a, then http://example.org."),
    ["https://example.com/a", "http://example.org"],
  );
});

test("isBlockedAddress rejects private IPv4 addresses", () => {
  assert.equal(isBlockedAddress("127.0.0.1"), true);
  assert.equal(isBlockedAddress("10.0.0.1"), true);
  assert.equal(isBlockedAddress("192.168.1.1"), true);
  assert.equal(isBlockedAddress("8.8.8.8"), false);
});

test("isBlockedAddress rejects local IPv6 addresses", () => {
  assert.equal(isBlockedAddress("::1"), true);
  assert.equal(isBlockedAddress("fc00::1"), true);
  assert.equal(isBlockedAddress("2001:4860:4860::8888"), false);
});

test("validateUrlTarget rejects unsupported schemes", async () => {
  await assert.rejects(
    () => validateUrlTarget("file:///etc/passwd"),
    error => error instanceof ContentError && error.code === "URL_BLOCKED",
  );
});

test("validateUrlTarget rejects loopback literals", async () => {
  await assert.rejects(
    () => validateUrlTarget("http://127.0.0.1/test"),
    error => error instanceof ContentError && error.code === "URL_BLOCKED",
  );
});

test("validateUrlTarget rejects embedded credentials", async () => {
  await assert.rejects(
    () => validateUrlTarget("https://user:pass@example.com/"),
    error => error instanceof ContentError && error.code === "URL_BLOCKED",
  );
});
