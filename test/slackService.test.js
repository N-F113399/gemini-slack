import test from "node:test";
import assert from "node:assert/strict";
import { sendSlackMessage } from "../src/services/slackService.js";

test("sendSlackMessage passes Slack auth and message payload", async () => {
  const originalToken = process.env.SLACK_BOT_TOKEN;
  process.env.SLACK_BOT_TOKEN = "test-token";

  let received;
  try {
    const result = await sendSlackMessage("C123", "123.456", "hello", {
      fetchImpl: async (url, options) => {
        received = { url, options };
        return {
          async json() {
            return { ok: true, ts: "999.1" };
          },
        };
      },
    });

    assert.deepEqual(result, { ok: true, ts: "999.1" });
    assert.equal(received.url, "https://slack.com/api/chat.postMessage");
    assert.equal(received.options.headers.Authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(received.options.body), {
      channel: "C123",
      thread_ts: "123.456",
      text: "hello",
    });
    assert.ok(received.options.signal instanceof AbortSignal);
  } finally {
    if (originalToken === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = originalToken;
  }
});

test("sendSlackMessage aborts after configured timeout", async () => {
  const originalTimeout = process.env.SLACK_API_TIMEOUT_MS;
  process.env.SLACK_API_TIMEOUT_MS = "10";

  try {
    await assert.rejects(
      () =>
        sendSlackMessage("C123", null, "hello", {
          fetchImpl: async (_url, { signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
              });
            }),
        }),
      /Slack API request timed out after 10ms/,
    );
  } finally {
    if (originalTimeout === undefined) delete process.env.SLACK_API_TIMEOUT_MS;
    else process.env.SLACK_API_TIMEOUT_MS = originalTimeout;
  }
});
