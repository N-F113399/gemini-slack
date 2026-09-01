import { jest } from "@jest/globals";

const getSummary = jest.fn();
const getLatestReplies = jest.fn();
const saveSummary = jest.fn();
const generate = jest.fn();
const buildPrompt = jest.fn(({ userMessage }) => [{ role: "user", parts: [{ text: userMessage }] }]);

jest.unstable_mockModule("../src/services/conversationSummaryStore.js", () => ({
  getSummary,
  saveSummary,
}));
jest.unstable_mockModule("../src/services/messageStore.js", () => ({
  getLatestReplies,
}));
jest.unstable_mockModule("../src/services/gemini/geminiService.js", () => ({
  generate,
}));
jest.unstable_mockModule("../src/services/gemini/promptBuilder.js", () => ({
  buildPrompt,
}));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { updateSummaryIfNeeded } = await import("../src/services/conversationSummaryService.js");

describe("conversationSummaryService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SUMMARY_TRIGGER_MESSAGES;
    delete process.env.SUMMARY_UPDATE_INTERVAL;
    delete process.env.SYSTEM_PROMPT;
  });

  test("does not create a summary before the trigger count", async () => {
    getSummary.mockResolvedValue(null);
    getLatestReplies.mockResolvedValue(Array.from({ length: 19 }, (_, i) => ({
      message_ts: String(i),
      role: "user",
      text: `message ${i}`,
    })));

    await expect(updateSummaryIfNeeded({ channel_id: "C1", thread_ts: "T1" })).resolves.toBe(false);
    expect(generate).not.toHaveBeenCalled();
    expect(saveSummary).not.toHaveBeenCalled();
  });

  test("creates the first summary at the trigger count", async () => {
    getSummary.mockResolvedValue(null);
    getLatestReplies.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({
      message_ts: String(i),
      role: i % 2 ? "bot" : "user",
      text: `message ${i}`,
    })));
    generate.mockResolvedValue({ text: "summary text", model: "test-model" });
    saveSummary.mockResolvedValue({ id: 1 });

    await expect(updateSummaryIfNeeded({ channel_id: "C1", thread_ts: "T1" })).resolves.toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(saveSummary).toHaveBeenCalledWith({
      channel_id: "C1",
      thread_ts: "T1",
      summary: "summary text",
      message_count: 20,
    });
  });

  test("does not update until the configured interval after an existing summary", async () => {
    getSummary.mockResolvedValue({ summary: "old summary", message_count: 20 });
    getLatestReplies.mockResolvedValue(Array.from({ length: 29 }, (_, i) => ({
      message_ts: String(i),
      role: "user",
      text: `message ${i}`,
    })));

    await expect(updateSummaryIfNeeded({ channel_id: "C1", thread_ts: "T1" })).resolves.toBe(false);
    expect(generate).not.toHaveBeenCalled();
    expect(saveSummary).not.toHaveBeenCalled();
  });

  test("updates an existing summary when the interval is reached", async () => {
    getSummary.mockResolvedValue({ summary: "old summary", message_count: 20 });
    getLatestReplies.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({
      message_ts: String(i),
      role: i % 2 ? "bot" : "user",
      text: `message ${i}`,
    })));
    generate.mockResolvedValue({ text: "new summary", model: "test-model" });
    saveSummary.mockResolvedValue({ id: 1 });

    await expect(updateSummaryIfNeeded({ channel_id: "C1", thread_ts: "T1" })).resolves.toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(buildPrompt.mock.calls[0][0].userMessage).toContain("old summary");
    expect(buildPrompt.mock.calls[0][0].userMessage).toContain("message 20");
    expect(saveSummary).toHaveBeenCalledWith({
      channel_id: "C1",
      thread_ts: "T1",
      summary: "new summary",
      message_count: 30,
    });
  });

  test("returns false when Gemini summary generation fails", async () => {
    getSummary.mockResolvedValue(null);
    getLatestReplies.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({
      message_ts: String(i),
      role: "user",
      text: `message ${i}`,
    })));
    generate.mockRejectedValue(new Error("Gemini unavailable"));

    await expect(updateSummaryIfNeeded({ channel_id: "C1", thread_ts: "T1" })).resolves.toBe(false);
    expect(saveSummary).not.toHaveBeenCalled();
  });
});
