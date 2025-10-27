export async function sendSlackMessage(channel, thread_ts, text) {
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`
      },
      body: JSON.stringify({
        channel,
        thread_ts,
        text
      })
    });
  } catch (error) {
    console.error("Error sending message to Slack:", error);
  }
}
