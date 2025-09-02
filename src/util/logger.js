import { EmbedBuilder } from "discord.js";

let cachedChannel = null;
let cachedChannelId = null;

export async function initLogger(client, channelIdFromEnv) {
  cachedChannelId = channelIdFromEnv || process.env.LOG_CHANNEL_ID;
  if (!cachedChannelId) {
    console.warn("[log] LOG_CHANNEL_ID manquant (env). Logs Discord désactivés.");
    return;
  }
  try {
    cachedChannel = await client.channels.fetch(cachedChannelId);
    console.log(`[log] Canal de logs prêt: #${cachedChannel?.name} (${cachedChannelId})`);
  } catch (e) {
    cachedChannel = null;
    console.warn(`[log] Impossible de récupérer le canal ${cachedChannelId}: ${e?.message}`);
  }
}

export async function logToDiscord(title, message, opts = {}) {
  const { level = "info" } = opts;
  const color =
    level === "error" ? 0xE74C3C :
    level === "warn"  ? 0xF1C40F :
                        0x2ECC71;

  // Toujours log en console
  const prefix = level === "error" ? "[ERR]" : level === "warn" ? "[WARN]" : "[INFO]";
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`${prefix} ${title}: ${message}`);

  // Si pas de canal, on s’arrête là
  if (!cachedChannel) return;

  try {
    const embed = new EmbedBuilder()
      .setTitle(title?.toString().slice(0, 256) || "Log")
      .setDescription((message ?? "").toString().slice(0, 4000))
      .setColor(color)
      .setTimestamp(new Date());
    await cachedChannel.send({ embeds: [embed] });
  } catch (e) {
    console.warn(`[log] Envoi Discord échoué: ${e?.message}`);
  }
}
