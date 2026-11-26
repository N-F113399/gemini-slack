import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachSocketDiagnostics, extractUrls, isBlockedAddress, selectPreferredAddress, validateUrlTarget } from "../src/services/content/urlResolver.js";
import { ContentError } from "../src/services/content/contentErrors.js";

test("extractUrls extracts unique http and https URLs", () => {
  assert.deepEqual(
    extractUrls("See https://example.com/a and https://example.com/a, then http://example.org."),
    ["https://example.com/a", "http://example.org"],
  );
});

test("extractUrls supports Slack link markup", () => {
  assert.deepEqual(
    extractUrls("Read <https://example.com/article|the article> and https://example.org/docs"),
    ["https://example.com/article", "https://example.org/docs"],
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


test("selectPreferredAddress prefers IPv4 when both families are available", () => {
  assert.deepEqual(
    selectPreferredAddress([
      { address: "2001:db8::1", family: 6 },
      { address: "203.0.113.10", family: 4 },
    ]),
    { address: "203.0.113.10", family: 4 },
  );
});

test("selectPreferredAddress uses IPv6 when IPv4 is unavailable", () => {
  assert.deepEqual(
    selectPreferredAddress([
      { address: "2001:db8::1", family: 6 },
    ]),
    { address: "2001:db8::1", family: 6 },
  );
});

test("selectPreferredAddress returns null when no usable record exists", () => {
  assert.equal(selectPreferredAddress([]), null);
});


test("attachSocketDiagnostics reports TCP and TLS connection phases", () => {
  const socket = new EventEmitter();
  socket.remoteAddress = "203.0.113.10";
  socket.remotePort = 443;
  socket.authorized = true;
  const events = [];

  attachSocketDiagnostics(socket, (event, details) => events.push({ event, details }));
  socket.emit("lookup", null, "203.0.113.10", 4);
  socket.emit("connect");
  socket.emit("secureConnect");

  assert.deepEqual(events.map(item => item.event), [
    "socket_lookup",
    "tcp_connected",
    "tls_connected",
  ]);
  assert.equal(events[1].details.remotePort, 443);
  assert.equal(events[2].details.authorized, true);
});

test("attachSocketDiagnostics reports socket errors", () => {
  const socket = new EventEmitter();
  const events = [];

  attachSocketDiagnostics(socket, (event, details) => events.push({ event, details }));
  socket.emit("error", Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }));

  assert.equal(events[0].event, "socket_error");
  assert.equal(events[0].details.code, "ECONNREFUSED");
});
