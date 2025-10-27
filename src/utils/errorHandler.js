import logger from "./logger.js";

export function handleError(error, context = "unknown") {
  logger.error(`[${context}] ${error.message}`);

  // Slackに返すメッセージ
  return {
    text: `:warning: An error occurred in *${context}*: ${error.message}`,
  };
}
