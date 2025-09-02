let clientRef = null;
let logChannelId = null;

/** Initialise la journalisation Discord (canal de logs) */
export async function initLogger(client, channelId) {
  clientRef = client;
  logChannelId = channelId || process.env.LOG_CHANNEL_ID || null;

  // Accroche les consoles pour tout voir dans Railway ET Discord
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;

  console.log = (...args) => {
    origLog(...args);
    sendToDiscord("🟢 LOG", args.join(" "), "info");
  };
  console.warn = (...args) => {
    origWarn(...args);
    sendToDiscord("🟠 WARN", args.join(" "), "warn");
  };
  console.error = (...args) => {
    origErr(...args);
    sendToDiscord("🔴 ERROR", args.join(" "), "error");
  };
}

/** Envoie un message dans le canal de logs (si configuré) */
export async function logToDiscord(title, message, { level = "info" } = {}) {
  await sendToDiscord(title, message, level);
}

async function sendToDiscord(title, message, level) {
  try {
    if (!clientRef || !logChannelId) return;
    const ch = await clientRef.channels.fetch(logChannelId).catch(() => null);
    if (!ch) return;
    const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : "ℹ️";
    await ch.send(`${prefix} **${title}**\n\`\`\`\n${(message ?? "").toString().slice(0, 1900)}\n\`\`\``);
  } catch (_) {
    // on évite toute boucle d'erreur de log
  }
}
