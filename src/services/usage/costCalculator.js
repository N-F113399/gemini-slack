const DEFAULT_CURRENCY = "USD";

function normalizeRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export const PRICING_TABLE = Object.freeze({
  "search:tavily": Object.freeze({ provider: "tavily", service: "search", unit: "credit", pricePerUnitUsd: 0.008, effectiveFrom: "2026-09-01", source: "https://www.tavily.com/pricing" }),
  "search:exa": Object.freeze({ provider: "exa", service: "search", unit: "request", pricePerUnitUsd: 0.007, includedResults: 10, additionalResultPricePerUnitUsd: 0.001, effectiveFrom: "2026-09-01", source: "https://exa.ai/pricing?tab=api" }),
  "search:you": Object.freeze({ provider: "you", service: "search", unit: "request", pricePerUnitUsd: 0.005, effectiveFrom: "2026-09-01", source: "https://you.com/docs/administration/billing" }),
  "gemini:gemini-3.5-flash-lite": Object.freeze({ provider: "gemini", service: "gemini", unit: "token", inputPricePerMillionUsd: 0.3, outputPricePerMillionUsd: 2.5, effectiveFrom: "2026-09-01", source: "https://ai.google.dev/gemini-api/docs/pricing" }),
  "gemini:gemini-flash-lite-latest": Object.freeze({ provider: "gemini", service: "gemini", unit: "token", inputPricePerMillionUsd: 0.3, outputPricePerMillionUsd: 2.5, effectiveFrom: "2026-09-01", source: "https://ai.google.dev/gemini-api/docs/pricing", aliasFor: "gemini-3.5-flash-lite" }),
});

function getPricingKey({ provider, service, model }) {
  if (service === "gemini") return `gemini:${model || ""}`;
  return `${service}:${provider}`;
}

export function getPricing({ provider, service, model, pricingTable = PRICING_TABLE } = {}) {
  return pricingTable[getPricingKey({ provider, service, model })] || null;
}

export function calculateUsageCost({ provider, service, model = null, inputTokens = 0, outputTokens = 0, totalTokens = 0, credits = 0, requests = 0, resultCount = 0, pricingTable = PRICING_TABLE } = {}) {
  const pricing = getPricing({ provider, service, model, pricingTable });
  if (!pricing) return null;

  if (service === "gemini") {
    const input = normalizeRate(inputTokens) ?? 0;
    const output = normalizeRate(outputTokens) ?? 0;
    return (input / 1_000_000) * pricing.inputPricePerMillionUsd + (output / 1_000_000) * pricing.outputPricePerMillionUsd;
  }

  if (provider === "tavily") return (normalizeRate(credits) ?? 0) * pricing.pricePerUnitUsd;

  const requestCount = normalizeRate(requests) ?? 0;
  if (provider === "exa" && pricing.includedResults && resultCount > pricing.includedResults) {
    return requestCount * pricing.pricePerUnitUsd + (resultCount - pricing.includedResults) * pricing.additionalResultPricePerUnitUsd;
  }
  return requestCount * pricing.pricePerUnitUsd;
}

export function annotateUsageEventCost(event, options = {}) {
  const cost = calculateUsageCost({
    provider: event?.provider,
    service: event?.service,
    model: event?.metadata?.model,
    inputTokens: event?.tokens?.input,
    outputTokens: event?.tokens?.output,
    credits: event?.search?.credits,
    requests: event?.search?.requests,
    resultCount: event?.metadata?.resultCount,
    ...options,
  });
  return { ...event, estimatedCostUsd: cost };
}

export { DEFAULT_CURRENCY };