const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_WINDOW_MS = 60_000;

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export class RateLimitError extends Error {
  constructor(message, { key, retryAfterMs, limit, windowMs, count } = {}) {
    super(message);
    this.name = "RateLimitError";
    this.code = "RATE_LIMIT_EXCEEDED";
    this.key = key;
    this.retryAfterMs = retryAfterMs;
    this.limit = limit;
    this.windowMs = windowMs;
    this.count = count;
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
      throw new TypeError("Rate limit key is required");
    }

    const normalizedKey = key.trim();
    const currentTime = this.now();
    const existing = this.buckets.get(normalizedKey);
    const bucket = existing && currentTime - existing.startedAt < this.windowMs
      ? existing
      : { startedAt: currentTime, count: 0 };

    if (bucket.count >= this.maxRequests) {
      const retryAfterMs = Math.max(0, this.windowMs - (currentTime - bucket.startedAt));
      throw new RateLimitError("Rate limit exceeded", {
        key: normalizedKey,
        retryAfterMs,
        limit: this.maxRequests,
        windowMs: this.windowMs,
        count: bucket.count,
      });
    }

    bucket.count += 1;
    this.buckets.set(normalizedKey, bucket);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - bucket.count),
      retryAfterMs: 0,
    };
  }

  reset(key) {
    return this.buckets.delete(key);
  }

  clear() {
    this.buckets.clear();
  }

  size() {
    return this.buckets.size;
  }
}

export const rateLimiter = new InMemoryRateLimiter();
