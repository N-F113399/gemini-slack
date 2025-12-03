import crypto from "crypto";

/**
 * Generate a 32-byte base64 encoded key for tests.
 * @returns {string}
 */
export function generateTestEncryptionKey() {
  return crypto.randomBytes(32).toString("base64");
}
