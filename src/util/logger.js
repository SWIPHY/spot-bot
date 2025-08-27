let clientRef = null;
let channelRef = null;

export function initLogger(client) {
  clientRef = client;
  const id = process.env.LOG_CHANNEL_ID;
  if (!id) {
    console.warn("LOG_CHANNEL_ID manquant → logs uniquement console.");
    return;
  }
  client.channels.fetch(id)
    .then(ch => { channelRef = ch; console.log("Logger prêt sur #", ch?.name || id); })
    .catch(e => {
      console.error("fetch LOG_CHANNEL_ID failed:", e?.message || e);
    });
}

export function logToDiscord(content) {
  if (channelRef) {
    channelRef.send(typeof content === "string" ? content : "```json\n" + JSON.stringify(content, null, 2) + "\n```")
      .catch(e => console.error("logToDiscord send failed:", e?.message || e));
  } else {
    console.log("[BOT-LOG]", content);
  }
}
