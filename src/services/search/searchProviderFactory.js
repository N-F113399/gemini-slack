import { SEARCH_PROVIDER_NAMES } from "./searchModels.js";
import { tavilySearchProvider } from "./providers/tavilyProvider.js";
import { exaSearchProvider } from "./providers/exaProvider.js";
import { youSearchProvider } from "./providers/youProvider.js";

const PROVIDERS = Object.freeze({
  [SEARCH_PROVIDER_NAMES.TAVILY]: tavilySearchProvider,
  [SEARCH_PROVIDER_NAMES.EXA]: exaSearchProvider,
  [SEARCH_PROVIDER_NAMES.YOU]: youSearchProvider,
});

const ENV_KEYS = Object.freeze({
  [SEARCH_PROVIDER_NAMES.TAVILY]: "TAVILY_API_KEY",
  [SEARCH_PROVIDER_NAMES.EXA]: "EXA_API_KEY",
  [SEARCH_PROVIDER_NAMES.YOU]: "YDC_API_KEY",
});

const ENABLE_KEYS = Object.freeze({
  [SEARCH_PROVIDER_NAMES.TAVILY]: "SEARCH_TAVILY_ENABLED",
  [SEARCH_PROVIDER_NAMES.EXA]: "SEARCH_EXA_ENABLED",
  [SEARCH_PROVIDER_NAMES.YOU]: "SEARCH_YOU_ENABLED",
});

const DEFAULT_ORDER = [
  SEARCH_PROVIDER_NAMES.TAVILY,
  SEARCH_PROVIDER_NAMES.EXA,
  SEARCH_PROVIDER_NAMES.YOU,
];

function isEnabled(name) {
  const key = ENABLE_KEYS[name];
  const value = process.env[key];
  return value === undefined || !["false", "0", "off"].includes(value.toLowerCase());
}

function hasApiKey(name) {
  const key = ENV_KEYS[name];
  return typeof process.env[key] === "string" && process.env[key].trim().length > 0;
}

function parseOrder() {
  const raw = process.env.SEARCH_PROVIDER_ORDER;
  if (!raw) return DEFAULT_ORDER;
  const requested = raw.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  const valid = requested.filter(name => PROVIDERS[name]);
  return valid.length > 0 ? valid : DEFAULT_ORDER;
}

export function createConfiguredSearchProviders() {
  return parseOrder()
    .filter(name => isEnabled(name) && hasApiKey(name))
    .map(name => PROVIDERS[name]);
}

export function getConfiguredSearchProviderNames() {
  return createConfiguredSearchProviders().map(provider => provider.name);
}
