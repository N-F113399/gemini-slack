import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifySlackSignature } from "../src/middleware/slackSignature.js";

function sign(secret, timestamp, body) {
  return `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

function request({ secret = "secret", body = "payload", timestamp = Math.floor(Date.now() / 1000), signature = null } = {}) {
  const req = {
    rawBody: Buffer.from(body),
    get(name) {
      return {
        "x-slack-request-timestamp": String(timestamp),
        "x-slack-signature": signature ?? sign(secret, timestamp, body),
      }[name];
    },
  };
  return req;
}

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("accepts a valid Slack signature", () => {
  const secret = "secret";
  const timestamp = Math.floor(Date.now() / 1000);
  const req = request({ secret, timestamp });
  const res = response();
  let called = false;

  process.env.SLACK_SIGNING_SECRET = secret;
  verifySlackSignature(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, null);
});

test("rejects an invalid signature", () => {
  process.env.SLACK_SIGNING_SECRET = "secret";
  const req = request({ signature: "v0=invalid" });
  const res = response();

  verifySlackSignature(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Unauthorized" });
});

test("rejects stale timestamps", () => {
  process.env.SLACK_SIGNING_SECRET = "secret";
  const timestamp = Math.floor(Date.now() / 1000) - 301;
  const req = request({ timestamp });
  const res = response();

  verifySlackSignature(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

test("rejects missing signing secret", () => {
  delete process.env.SLACK_SIGNING_SECRET;
  const req = request();
  const res = response();

  verifySlackSignature(req, res, () => {});

  assert.equal(res.statusCode, 401);
});
