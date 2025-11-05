import logger from "../utils/logger.js";

export function checkEnvVars() {
  const requiredVars = [
    "SLACK_BOT_TOKEN",
    "GEMINI_API_KEY",
    "SYSTEM_PROMPT",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_ENC_KEY"
  ];

  const missing = requiredVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error(`Missing environment variables: ${missing.join(", ")}`);
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  logger.info("✅ All environment variables are present.");
}
