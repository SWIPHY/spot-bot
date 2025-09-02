import {
  EmbedBuilder,
  Colors,
} from "discord.js";

let clientRef = null;
let channelId = null;

export function initLogger(client, logChannelId) {
  clientRef = client;
  channelId = logChannelId || null;
}

function color(level) {
  switch (level) {
    case "error": return Colors.Red;
    case "warn":  return Colors.Yellow;
    case "info":  return Colors.Blurple;
    default:      return Colors.Greyple;
  }
}

export async function logToDiscord(title, message, { level = "info" } = {}) {
  // console
  const prefix = level.toUpperCase();
  if (level === "error") console.error(`[${prefix}] ${title}:`, message);
  else if (level === "warn") console.warn(`[${prefix}] ${title}:`, message);
  else console.log(`[${prefix}] ${title}:`, message);

  // channel
  try {
    if (!clientRef || !channelId) return;
    const ch = await clientRef.channels.fetch(channelId).catch(() => null);
    if (!ch) return;

    const embed = new EmbedBuilder()
      .setColor(color(level))
      .setTitle(title)
      .setDescription(typeof message === "string" ? message.slice(0, 4000) : "—")
      .setTimestamp(new Date());

    await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error("[LOGGER] send failed:", e);
  }
}
