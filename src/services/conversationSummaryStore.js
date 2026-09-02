// src/services/conversationSummaryStore.js
import logger from "../utils/logger.js";
import { encryptText, decryptText } from "../utils/crypto.js";

let supabasePromise;

async function getSupabase() {
  if (!supabasePromise) {
    supabasePromise = import("./db.js").then(module => module.default);
  }
  return supabasePromise;
}

function buildAad(channel_id, thread_ts) {
  return `${channel_id}|${thread_ts}|summary`;
}

/**
 * Get the summary for a Slack thread and decrypt it.
 * Returns null when no summary exists or the lookup fails.
 */
export async function getSummary(channel_id, thread_ts) {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("conversation_summaries")
      .select("channel_id,thread_ts,summary_cipher,iv,auth_tag,enc_version,message_count,created_at,updated_at")
      .eq("channel_id", channel_id)
      .eq("thread_ts", thread_ts)
      .maybeSingle();

    if (error) {
      logger.error("Supabase summary select error: " + error.message);
      return null;
    }

    if (!data) return null;

    try {
      const summary = decryptText(
        data.summary_cipher,
        data.iv,
        data.auth_tag,
        buildAad(data.channel_id, data.thread_ts),
      );

      return {
        channel_id: data.channel_id,
        thread_ts: data.thread_ts,
        summary,
        message_count: data.message_count,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (err) {
      logger.error(`Failed to decrypt summary ${channel_id}/${thread_ts}: ${err.message}`);
      return null;
    }
  } catch (err) {
    logger.error("getSummary unexpected error: " + err.message);
    return null;
  }
}

/**
 * Insert or update the encrypted summary for a Slack thread.
 */
export async function saveSummary({ channel_id, thread_ts, summary, message_count = 0 }) {
  try {
    const supabase = await getSupabase();
    const aad = buildAad(channel_id, thread_ts);
    const { ciphertext, iv, authTag } = encryptText(summary, aad);

    const { data, error } = await supabase
      .from("conversation_summaries")
      .upsert([{
        channel_id,
        thread_ts,
        summary_cipher: ciphertext,
        iv,
        auth_tag: authTag,
        enc_version: 1,
        message_count,
      }], { onConflict: ["channel_id", "thread_ts"], returning: "representation" });

    if (error) {
      logger.error("Supabase summary upsert error: " + error.message);
      return null;
    }

    return data?.[0] || null;
  } catch (err) {
    logger.error("saveSummary unexpected error: " + err.message);
    return null;
  }
}
