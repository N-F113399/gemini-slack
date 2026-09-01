import test from "node:test";
import assert from "node:assert/strict";
import { createConfiguredSearchProviders, getConfiguredSearchProviderNames } from "../src/services/search/searchProviderFactory.js";

const KEYS = ["TAVILY_API_KEY", "EXA_API_KEY", "YDC_API_KEY", "SEARCH_PROVIDER_ORDER", "SEARCH_TAVILY_ENABLED", "SEARCH_EXA_ENABLED", "SEARCH_YOU_ENABLED"];

function snapshotEnv() {
  return Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

test("provider factory skips providers without API keys", () => {
  const snapshot = snapshotEnv();
  try {
    delete process.env.TAVILY_API_KEY;
    delete process.env.EXA_API_KEY;
    delete process.env.YDC_API_KEY;
    assert.deepEqual(getConfiguredSearchProviderNames(), []);
  } finally {
    restoreEnv(snapshot);
  }
});

test("provider factory preserves configured provider order", () => {
  const snapshot = snapshotEnv();
  try {
    process.env.TAVILY_API_KEY = "t";
    process.env.EXA_API_KEY = "e";
    process.env.YDC_API_KEY = "y";
    process.env.SEARCH_PROVIDER_ORDER = "you,exa,tavily";
    assert.deepEqual(getConfiguredSearchProviderNames(), ["you", "exa", "tavily"]);
  } finally {
    restoreEnv(snapshot);
  }
});

test("provider factory excludes disabled providers", () => {
  const snapshot = snapshotEnv();
  try {
    process.env.TAVILY_API_KEY = "t";
    process.env.EXA_API_KEY = "e";
    process.env.YDC_API_KEY = "y";
    process.env.SEARCH_PROVIDER_ORDER = "tavily,exa,you";
    process.env.SEARCH_EXA_ENABLED = "false";
    assert.deepEqual(getConfiguredSearchProviderNames(), ["tavily", "you"]);
  } finally {
    restoreEnv(snapshot);
  }
});
