import logger from "../utils/logger.js";

const requiredAtStartup = ["SLACK_BOT_TOKEN", "GEMINI_API_KEY", "SYSTEM_PROMPT"];
const optionalEnvVars = ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_ENC_KEY"];

export function checkEnvVars() {
  const allowMissingForTests =
    String(process.env.ALLOW_MISSING_ENV_FOR_TESTS || "").toLowerCase() === "true";

  const missingRequired = requiredAtStartup.filter((key) => !process.env[key]);
  const missingOptional = optionalEnvVars.filter((key) => !process.env[key]);

  if (missingRequired.length > 0) {
    const message = `Missing required environment variables: ${missingRequired.join(", ")}`;
    if (allowMissingForTests) {
      logger.warn(`[ALLOW_MISSING_ENV_FOR_TESTS] ${message}`);
    } else {
      logger.error(message);
      throw new Error(message);
    }
  } else {
    logger.info("✅ All required environment variables are present.");
  }

  if (missingOptional.length > 0) {
    logger.warn(`Optional environment variables are missing: ${missingOptional.join(", ")}`);
  } else {
    logger.info("✅ All optional environment variables are present.");
  }
}
