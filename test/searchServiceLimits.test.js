import test from "node:test";
import assert from "node:assert/strict";
import { SearchService } from "../src/services/search/searchService.js";
import { SearchProviderError, SEARCH_ERROR_CODES } from "../src/services/search/searchErrors.js";

function provider(name, implementation) {
  return { name, search: implementation };
}

test("SearchService rejects queries over the configured character limit", async () => {
  const previous = process.env.SEARCH_MAX_QUERY_LENGTH;
  process.env.SEARCH_MAX_QUERY_LENGTH = "5";
  try {
    const service = new SearchService({
      providers: [provider("test", async () => ({ results: [] }))],
    });
    await assert.rejects(
      () => service.search({ text: "123456" }),
      error => error instanceof SearchProviderError && error.code === SEARCH_ERROR_CODES.INVALID_REQUEST,
    );
  } finally {
    if (previous === undefined) delete process.env.SEARCH_MAX_QUERY_LENGTH;
    else process.env.SEARCH_MAX_QUERY_LENGTH = previous;
  }
});

test("SearchService rejects result limits above the configured maximum", async () => {
  const previous = process.env.SEARCH_MAX_RESULTS;
  process.env.SEARCH_MAX_RESULTS = "2";
  try {
    const service = new SearchService({
      providers: [provider("test", async () => ({ results: [] }))],
    });
    await assert.rejects(
      () => service.search({ text: "test", maxResults: 3 }),
      error => error instanceof SearchProviderError && error.code === SEARCH_ERROR_CODES.INVALID_REQUEST,
    );
  } finally {
    if (previous === undefined) delete process.env.SEARCH_MAX_RESULTS;
    else process.env.SEARCH_MAX_RESULTS = previous;
  }
});

test("SearchService rejects excessive domain filters", async () => {
  const previous = process.env.SEARCH_MAX_DOMAINS;
  process.env.SEARCH_MAX_DOMAINS = "1";
  try {
    const service = new SearchService({
      providers: [provider("test", async () => ({ results: [] }))],
    });
    await assert.rejects(
      () => service.search({ text: "test", domains: ["a.example", "b.example"] }),
      error => error instanceof SearchProviderError && error.code === SEARCH_ERROR_CODES.INVALID_REQUEST,
    );
  } finally {
    if (previous === undefined) delete process.env.SEARCH_MAX_DOMAINS;
    else process.env.SEARCH_MAX_DOMAINS = previous;
  }
});

test("SearchService stops after the configured number of provider attempts", async () => {
  const previous = process.env.SEARCH_MAX_PROVIDER_ATTEMPTS;
  process.env.SEARCH_MAX_PROVIDER_ATTEMPTS = "2";
  let calls = 0;
  try {
    const service = new SearchService({
      providers: [
        provider("one", async () => {
          calls += 1;
          throw new SearchProviderError(SEARCH_ERROR_CODES.PROVIDER_ERROR, "failure", { retryable: true });
        }),
        provider("two", async () => {
          calls += 1;
          throw new SearchProviderError(SEARCH_ERROR_CODES.PROVIDER_ERROR, "failure", { retryable: true });
        }),
        provider("three", async () => {
          calls += 1;
          return { results: [] };
        }),
      ],
    });

    await assert.rejects(() => service.search({ text: "test" }), SearchProviderError);
    assert.equal(calls, 2);
  } finally {
    if (previous === undefined) delete process.env.SEARCH_MAX_PROVIDER_ATTEMPTS;
    else process.env.SEARCH_MAX_PROVIDER_ATTEMPTS = previous;
  }
});
