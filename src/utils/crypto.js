import crypto from "crypto";
import logger from "./logger.js";

let cachedKey = null;

export function getEncryptionKey() {
  if (cachedKey) return cachedKey;

  const keyBase64 = process.env.SUPABASE_ENC_KEY;
  if (!keyBase64) {
    throw new Error("Missing SUPABASE_ENC_KEY env var");
  }

  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("SUPABASE_ENC_KEY must be 32 bytes (base64)");
  }

  cachedKey = key;
  return cachedKey;
}

/**
 * AES-256-GCM で暗号化
 * @param {string} plaintext
 * @param {string} aad - optional additional authenticated data (string)
 * @returns {object} { ciphertext: base64, iv: base64, authTag: base64 }
 */
export function encryptText(plaintext, aad = "") {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // GCM recommended 12 bytes
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * 復号
 * @param {string} ciphertextBase64
 * @param {string} ivBase64
 * @param {string} authTagBase64
 * @param {string} aad
 * @returns {string} plaintext
 */
export function decryptText(ciphertextBase64, ivBase64, authTagBase64, aad = "") {
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    logger.error("Decrypt error: " + err.message);
    throw err;
  }
}
