const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 10;

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export class RateLimitError extends Error {
  constructor({ key, limit, windowMs, retryAfterMs }) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.code = "RATE_LIMIT_EXCEEDED";
    this.key = key;
    this.limit = limit;
    this.windowMs = windowMs;
    this.retryAfterMs = retryAfterMs;
  }
}

export class InMemoryRateLimiter {
  constructor({
    maxRequests = readPositiveInt("RATE_LIMIT_MAX_REQUESTS", DEFAULT_MAX_REQUESTS),
    windowMs = readPositiveInt("RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS),
    now = () => Date.now(),
  } = {}) {
    if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
      throw new TypeError("maxRequests must be a positive integer");
    }
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
      throw new TypeError("windowMs must be a positive integer");
    }
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.now = now;
    this.buckets = new Map();
  }

  check(key) {
    if (typeof key !== "string" || !key.trim()) {
      throw new TypeError("rate limit key is required");
    }

    const normalizedKey = key.trim();
    const currentTime = this.now();
    const bucket = this.buckets.get(normalizedKey);

    if (!bucket || currentTime - bucket.windowStartedAt >= this.windowMs) {
      this.buckets.set(normalizedKey, {
        windowStartedAt: currentTime,
        count: 1,
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        retryAfterMs: 0,
      };
    }

    if (bucket.count >= this.maxRequests) {
      const retryAfterMs = Math.max(0, this.windowMs - (currentTime - bucket.windowStartedAt));
      throw new RateLimitError({
        key: normalizedKey,
        limit: this.maxRequests,
        windowMs: this.windowMs,
        retryAfterMs,
      });
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - bucket.count,
      retryAfterMs: 0,
    };
  }

  reset(key) {
    if (typeof key !== "string" || !key.trim()) return false;
    return this.buckets.delete(key.trim());
  }

  clear() {
    this.buckets.clear();
  }
}

export const rateLimiter = new InMemoryRateLimiter();

export { DEFAULT_WINDOW_MS, DEFAULT_MAX_REQUESTS };
