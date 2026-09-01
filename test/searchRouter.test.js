import test from "node:test";
import assert from "node:assert/strict";
import { SearchRouter } from "../src/services/search/searchRouter.js";
import { SearchProviderError, SEARCH_ERROR_CODES } from "../src/services/search/searchErrors.js";

function provider(name, behavior) {
  return { name, search: behavior };
}

test("SearchRouter uses providers in configured order", async () => {
  const calls = [];
  const router = new SearchRouter({
    providers: [
      provider("tavily", async () => { calls.push("tavily"); return { provider: { name: "tavily" } }; }),
      provider("exa", async () => { calls.push("exa"); return { provider: { name: "exa" } }; }),
    ],
  });

  const result = await router.search({ text: "test" });
  assert.equal(result.provider.name, "tavily");
  assert.deepEqual(calls, ["tavily"]);
});

test("SearchRouter falls back on retryable provider errors", async () => {
  const calls = [];
  const router = new SearchRouter({
    providers: [
      provider("tavily", async () => {
        calls.push("tavily");
        throw new SearchProviderError(SEARCH_ERROR_CODES.PROVIDER_ERROR, "temporary", {
          provider: "tavily",
          retryable: true,
        });
      }),
      provider("exa", async () => { calls.push("exa"); return { provider: { name: "exa" } }; }),
    ],
  });

  const result = await router.search({ text: "test" });
  assert.equal(result.provider.name, "exa");
  assert.deepEqual(calls, ["tavily", "exa"]);
});

test("SearchRouter falls back on quota errors and cools down the failed provider", async () => {
  const calls = [];
  let now = 1000;
  const router = new SearchRouter({
    clock: () => now,
    providers: [
      provider("tavily", async () => {
        calls.push("tavily");
        throw new SearchProviderError(SEARCH_ERROR_CODES.QUOTA_EXCEEDED, "quota", {
          provider: "tavily",
          quotaRelated: true,
          retryable: false,
        });
      }),
      provider("exa", async () => { calls.push("exa"); return { provider: { name: "exa" } }; }),
    ],
  });

  await router.search({ text: "test" });
  await router.search({ text: "test again" });

  assert.deepEqual(calls, ["tavily", "exa", "exa"]);
  assert.equal(router.getProviderState("tavily").cooldownUntil, 61000);

  now = 61000;
  await router.search({ text: "test third" });
  assert.deepEqual(calls, ["tavily", "exa", "exa", "tavily", "exa"]);
});

test("SearchRouter falls back from authentication errors", async () => {
  const calls = [];
  const router = new SearchRouter({
    providers: [
      provider("tavily", async () => {
        calls.push("tavily");
        throw new SearchProviderError(SEARCH_ERROR_CODES.AUTHENTICATION, "auth", {
          provider: "tavily",
          retryable: false,
        });
      }),
      provider("exa", async () => { calls.push("exa"); return { provider: { name: "exa" } }; }),
    ],
  });

  const result = await router.search({ text: "test" });
  assert.equal(result.provider.name, "exa");
  assert.deepEqual(calls, ["tavily", "exa"]);
});

test("SearchRouter can disable a provider through environment configuration", async () => {
  const previous = process.env.SEARCH_TAVILY_ENABLED;
  process.env.SEARCH_TAVILY_ENABLED = "false";

  const calls = [];
  const router = new SearchRouter({
    providers: [
      provider("tavily", async () => { calls.push("tavily"); return { provider: { name: "tavily" } }; }),
      provider("exa", async () => { calls.push("exa"); return { provider: { name: "exa" } }; }),
    ],
  });

  try {
    const result = await router.search({ text: "test" });
    assert.equal(result.provider.name, "exa");
    assert.deepEqual(calls, ["exa"]);
  } finally {
    if (previous === undefined) delete process.env.SEARCH_TAVILY_ENABLED;
    else process.env.SEARCH_TAVILY_ENABLED = previous;
  }
});
