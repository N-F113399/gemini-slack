const userHistories = {};
const MAX_HISTORY = 10;

export function getUserHistory(userId) {
  if (!userHistories[userId]) userHistories[userId] = [];
  return userHistories[userId];
}

export function addUserMessage(userId, text) {
  const history = getUserHistory(userId);
  history.push({ role: "user", text });
  trimHistory(userId);
}

export function addBotMessage(userId, text) {
  const history = getUserHistory(userId);
  history.push({ role: "bot", text });
  trimHistory(userId);
}

function trimHistory(userId) {
  const history = userHistories[userId];
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}
