const DEFAULT_FREE_QUOTAS = Object.freeze({
  "search:tavily": Object.freeze({
    provider: "tavily",
    service: "search",
    period: "month",
    unit: "credits",
    limit: 1000,
    source: "https://www.tavily.com/pricing",
  }),
  "search:you": Object.freeze({
    provider: "you",
    service: "search",
    period: "day",
    unit: "requests",
    limit: 100,
    source: "https://about.you.com/pricing",
  }),
});

function parsePositiveNumber(name) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function getFreeQuota({ provider, service, quotaConfig = DEFAULT_FREE_QUOTAS } = {}) {
  const key = `${service}:${provider}`;
  const configured = quotaConfig[key];
  if (configured) return configured;

  const envPrefix = `${String(service).toUpperCase()}_${String(provider).toUpperCase()}`;
  const limit = parsePositiveNumber(`${envPrefix}_FREE_QUOTA_LIMIT`);
  if (limit === null) return null;

  return {
    provider,
    service,
    period: process.env[`${envPrefix}_FREE_QUOTA_PERIOD`] || "month",
    unit: process.env[`${envPrefix}_FREE_QUOTA_UNIT`] || "requests",
    limit,
    source: process.env[`${envPrefix}_FREE_QUOTA_SOURCE`] || "configuration",
  };
}

export function listFreeQuotas(quotaConfig = DEFAULT_FREE_QUOTAS) {
  return Object.values(quotaConfig);
}
