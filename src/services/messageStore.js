// src/services/messageStore.js
import supabase from "./db.js";
import logger from "../utils/logger.js";
import { encryptText, decryptText } from "../utils/crypto.js";

/**
 * Save message (encrypt text before insert)
 * params: { channel_id, thread_ts, message_ts, user_id, role, text }
 */
export async function saveMessage({ channel_id, thread_ts, message_ts, user_id = null, role = "user", text = "" }) {
  try {
    // AAD に thread context を含める（optional but recommended）
    const aad = `${channel_id}|${thread_ts}|${message_ts}`;

    const { ciphertext, iv, authTag } = encryptText(text, aad);

    // upsert は message_ts にユニーク制約があると便利
    const { data, error } = await supabase
      .from("slack_messages")
      .upsert([{
        channel_id,
        thread_ts,
        message_ts,
        user_id,
        role,
        text_cipher: ciphertext,
        iv,
        auth_tag: authTag,
        enc_version: 1
      }], { onConflict: ["message_ts"], returning: "representation" });

    if (error) {
      logger.error("Supabase insert error: " + error.message);
      return null;
    }
    return data?.[0] || null;
  } catch (err) {
    logger.error("saveMessage unexpected error: " + err.message);
    return null;
  }
}

/**
 * Get latest N replies (decrypted). Returns array ordered oldest->newest by default if reverse=false
 */
export async function getLatestReplies(channel_id, thread_ts, limit = 10, reverse = true) {
  try {
    const { data, error } = await supabase
      .from("slack_messages")
      .select("channel_id,thread_ts,message_ts,user_id,role,text_cipher,iv,auth_tag,enc_version,created_at")
      .eq("channel_id", channel_id)
      .eq("thread_ts", thread_ts)
      .neq("role", "") // safety
      .order("created_at", { ascending: false }) // newest first
      .limit(limit);

    if (error) {
      logger.error("Supabase select error: " + error.message);
      return [];
    }

    // data is newest->oldest, we want oldest->newest to feed AI in order
    const rows = data || [];
    const ordered = rows.reverse(); // now oldest->newest

    // decrypt each
    const results = ordered.map(row => {
      const aad = `${row.channel_id}|${row.thread_ts}|${row.message_ts}`;
      try {
        const plaintext = decryptText(row.text_cipher, row.iv, row.auth_tag, aad);
        return {
          channel_id: row.channel_id,
          thread_ts: row.thread_ts,
          message_ts: row.message_ts,
          user_id: row.user_id,
          role: row.role,
          text: plaintext,
          created_at: row.created_at
        };
      } catch (err) {
        logger.error(`Failed to decrypt message ${row.message_ts}: ${err.message}`);
        return {
          ...row,
          text: "[decryption_failed]"
        };
      }
    });

    return results;
  } catch (err) {
    logger.error("getLatestReplies unexpected error: " + err.message);
    return [];
  }
}
