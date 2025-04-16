const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  if (type === 'url_verification') {
    return res.send({ challenge });
  }

  if (event && event.type === 'app_mention') {
    const userMessage = event.text.replace(/<@[^>]+>/, '').trim();

    try {
      const geminiResponse = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: userMessage }] }]
        }
      );

      const reply = geminiResponse.data.candidates[0].content.parts[0].text;

      await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          channel: event.channel,
          text: reply,
        },
        {
          headers: {
            Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          }
        }
      );
    } catch (err) {
      console.error('Gemini API error:', err.message);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
