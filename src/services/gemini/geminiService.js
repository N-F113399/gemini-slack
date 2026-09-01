import logger from "../../utils/logger.js";
import { generateContent } from "./geminiClient.js";

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const DEFAULT_RETRY_LIMIT = 5;
const BASE_BACKOFF_MS = 300;
const MAX_BACKOFF_MS = 4000;
const DEFAULT_TIMEOUT_MS = 15000;

function getRetryModelNames() {
  return (process.env.GEMINI_RETRY_MODELS || "").split(",").map(model => model.trim()).filter(Boolean);
}

function isRetryableError(res, data) {
  if (res && (res.status === 429 || res.status === 503 || res.status === 504)) return true;
  const status = data?.error?.status;
  if (status === "RESOURCE_EXHAUSTED" || status === "UNAVAILABLE") return true;
  const message = (data?.error?.message || "").toLowerCase();
  return message.includes("quota") || message.includes("high demand") || message.includes("overloaded") || message.includes("unavailable");
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function backoffDelay(attemptIndex) {
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attemptIndex - 1, 0), MAX_BACKOFF_MS);
  return exp + Math.random() * 200;
}

export async function generate({ contents, systemPrompt }) {
  const timeoutMsEnv = Number(process.env.GEMINI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutMsEnv) && timeoutMsEnv > 0 ? timeoutMsEnv : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMsEnv) || timeoutMsEnv <= 0) logger.info(`timeoutMs is invalid; defaulting to ${timeoutMs}`);

  const retryLimitEnv = Number(process.env.GEMINI_RETRY_LIMIT);
  const retryLimit = Number.isFinite(retryLimitEnv) && retryLimitEnv > 0 ? retryLimitEnv : DEFAULT_RETRY_LIMIT;
  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const modelCandidates = [modelName, ...getRetryModelNames().slice(0, retryLimit)];

  let responseModel = modelName;
  let replyText = null;
  let usageMetadata = null;
  let lastErrorMsg = null;
  let failed = false;

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const currentModel = modelCandidates[index];
    responseModel = currentModel;
    if (index > 0) {
      const delay = backoffDelay(index);
      logger.info(`⏳ Backing off ${Math.round(delay)}ms before retry`);
      await sleep(delay);
    }
    logger.info(`🔁 Gemini request attempt ${index + 1}/${modelCandidates.length} with model=${currentModel}`);

    let res;
    let data;
    try {
      ({ res, data, usageMetadata: currentUsageMetadata } = await generateContent({ contents, systemPrompt, modelName: currentModel, timeoutMs }));
      if (currentUsageMetadata) usageMetadata = currentUsageMetadata;
    } catch (err) {
      lastErrorMsg = err.message;
      logger.warn(`Gemini request threw on model=${currentModel} (${err.name}): ${err.message}`);
      if (index === modelCandidates.length - 1) { failed = true; break; }
      continue;
    }

    logger.debug("📩 Gemini raw response:", JSON.stringify(data, null, 2));
    if (res.ok) {
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      replyText = candidateText ? candidateText.replace(/\n\n---\n使用モデル:.*$/s, "").trim() : "（応答がありませんでした）";
      responseModel = data?.modelVersion || currentModel;
      usageMetadata = data?.usageMetadata || usageMetadata;
      break;
    }

    lastErrorMsg = data?.error?.message || JSON.stringify(data ?? {});
    if (!isRetryableError(res, data) || index === modelCandidates.length - 1) { failed = true; break; }
    logger.warn(`Gemini error (status=${res.status}) on model=${currentModel}: ${lastErrorMsg}. Retrying with next model.`);
  }

  if (failed) {
    const error = new Error(lastErrorMsg || "Gemini API request failed");
    error.code = "GEMINI_API_ERROR";
    throw error;
  }

  return {
    text: replyText || "（応答がありませんでした）",
    model: responseModel,
    usage: usageMetadata,
  };
}
