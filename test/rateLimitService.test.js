import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRateLimiter, RateLimitError } from "../src/services/rateLimitService.js";

test("allows requests up to the configured limit", () => {
  let now = 1000;
  const limiter = new InMemoryRateLimiter({ maxRequests: 2, windowMs: 1000, now: () => now });

  assert.deepEqual(limiter.check("U1"), { allowed: true, remaining: 1, retryAfterMs: 0 });
  assert.deepEqual(limiter.check("U1"), { allowed: true, remaining: 0, retryAfterMs: 0 });
  assert.throws(() => limiter.check("U1"), (error) => {
    assert.ok(error instanceof RateLimitError);
    assert.equal(error.code, "RATE_LIMIT_EXCEEDED");
    assert.equal(error.retryAfterMs, 1000);
    return true;
  });

  now += 1000;
  assert.equal(limiter.check("U1").allowed, true);
});

test("tracks keys independently", () => {
  const limiter = new InMemoryRateLimiter({ maxRequests: 1, windowMs: 1000, now: () => 1000 });
  assert.equal(limiter.check("U1").allowed, true);
  assert.equal(limiter.check("U2").allowed, true);
});

test("reset clears one key without affecting others", () => {
  const limiter = new InMemoryRateLimiter({ maxRequests: 1, windowMs: 1000, now: () => 1000 });
  limiter.check("U1");
  limiter.check("U2");

  assert.equal(limiter.reset("U1"), true);
  assert.equal(limiter.check("U1").allowed, true);
  assert.throws(() => limiter.check("U2"), RateLimitError);
});

test("rejects invalid keys", () => {
  const limiter = new InMemoryRateLimiter({ maxRequests: 1, windowMs: 1000, now: () => 1000 });
  assert.throws(() => limiter.check(""), /key is required/);
});
