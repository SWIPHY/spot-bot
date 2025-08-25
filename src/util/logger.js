let logChannel = null;

export function initLogger(client) {
  const id = process.env.LOG_CHANNEL_ID;
  if (!id) return;
  client.channels.fetch(id)
    .then(ch => { logChannel = ch; })
    .catch(err => console.error("Logger: impossible de trouver le salon", err));
}

export function logToDiscord(msg) {
  console.log(msg); // garde aussi en console Railway
  if (logChannel) {
    // tronque si trop long (>2000 char Discord max)
    const safe = msg.length > 1900 ? msg.slice(0, 1900) + "..." : msg;
    logChannel.send("📝 " + safe).catch(() => {});
  }
}
