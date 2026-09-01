import fetch from "node-fetch";

/**
 * Low-level Gemini API client.
 * This module only knows how to communicate with the Gemini API.
 */
export async function generateContent({ modelName, contents, systemPrompt, timeoutMs }) {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const body = { contents };
  if (systemPrompt?.trim()) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  let res;
  try {
    res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    data = {
      error: {
        message: `Non-JSON response (status ${res.status})`,
        status: String(res.status),
      },
    };
  }

  return { res, data };
}
