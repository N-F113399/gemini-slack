export async function sendSlackAlert(message, { channel = process.env.ALERT_SLACK_CHANNEL } = {}) {
  if (!channel) throw new Error("ALERT_SLACK_CHANNEL is required");
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is required");

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text: message }),
  });

  if (!response.ok) {
    throw new Error(`Slack alert request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok) throw new Error(`Slack alert request failed: ${data.error || "unknown_error"}`);
  return data;
}
