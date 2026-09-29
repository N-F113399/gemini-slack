import crypto from "node:crypto";

const DEFAULT_MAX_AGE_SECONDS = 300;

function getSigningSecret() {
  return process.env.SLACK_SIGNING_SECRET || "";
}

function isFreshTimestamp(timestamp, nowMs = Date.now(), maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS) {
  const parsed = Number(timestamp);
  if (!Number.isInteger(parsed) || parsed <= 0) return false;
  return Math.abs(nowMs - parsed * 1000) <= maxAgeSeconds * 1000;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifySlackSignature(req, res, next) {
  const secret = getSigningSecret();
  const timestamp = req.get("x-slack-request-timestamp");
  const signature = req.get("x-slack-signature");
  const rawBody = req.rawBody;

  if (!secret || !timestamp || !signature || !rawBody || !isFreshTimestamp(timestamp)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const basestring = `v0:${timestamp}:${rawBody.toString("utf8")}`;
  const expected = `v0=${crypto.createHmac("sha256", secret).update(basestring).digest("hex")}`;

  if (!safeEqual(expected, signature)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}
