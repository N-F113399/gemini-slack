import test from "node:test";
import assert from "node:assert/strict";
import { validateSlackFile } from "../src/services/content/slackFileResolver.js";
import { ContentError } from "../src/services/content/contentErrors.js";

test("validateSlackFile accepts a valid Slack file", () => {
  assert.doesNotThrow(() => validateSlackFile({
    id: "F123",
    url_private_download: "https://files.slack.com/files-pri/F123/test.png",
    mimetype: "image/png",
    size: 1024,
  }));
});

test("validateSlackFile rejects missing file id", () => {
  assert.throws(
    () => validateSlackFile({ url_private_download: "https://example.com/file" }),
    (error) => error instanceof ContentError && error.code === "INVALID_FILE",
  );
});

test("validateSlackFile rejects a file over the configured size limit", () => {
  const previous = process.env.MAX_SLACK_FILE_SIZE;
  process.env.MAX_SLACK_FILE_SIZE = "100";

  try {
    assert.throws(
      () => validateSlackFile({
        id: "F123",
        url_private_download: "https://files.slack.com/files-pri/F123/test.png",
        size: 101,
      }),
      (error) => error instanceof ContentError && error.code === "FILE_TOO_LARGE",
    );
  } finally {
    if (previous === undefined) delete process.env.MAX_SLACK_FILE_SIZE;
    else process.env.MAX_SLACK_FILE_SIZE = previous;
  }
});
