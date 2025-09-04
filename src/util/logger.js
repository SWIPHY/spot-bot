import { EmbedBuilder } from "discord.js";

let _client = null;

/**
 * À appeler une fois quand le bot est prêt.
 * Exemple: client.once("ready", () => initLogger(client))
 */
export function initLogger(client) {
  _client = client;
}

/**
 * Crée un logger lié au client et (optionnellement) à un salon.
 * Si logChannelId n'est pas fourni, utilise process.env.LOG_CHANNEL_ID.
 *
 * const logger = makeLogger(client)
 * logger.info("Coucou")
 * logger.warn({ title: "Attention", desc: "qqchose s'est passé" })
 * logger.error(new Error("boom"))
 */
export function makeLogger(client, logChannelId) {
  const c = client ?? _client;
  const targetId = (logChannelId || process.env.LOG_CHANNEL_ID || "").trim() || null;

  function getChannel() {
    try {
      if (!c || !targetId) return null;
      return c.channels.cache.get(targetId) ?? null;
    } catch {
      return null;
    }
  }

  async function send(kind, payload) {
    const chan = getChannel();
    const color =
      kind === "error" ? 0xe74c3c :
      kind === "warn"  ? 0xf1c40f :
                         0x2ecc71;

    // Normalise payload -> {title?, desc?, fields?}
    let consoleText = "";
    let embed = new EmbedBuilder().setColor(color);

    if (typeof payload === "string") {
      consoleText = payload;
      embed.setDescription(payload);
    } else if (payload instanceof Error) {
      consoleText = payload.stack || payload.message || String(payload);
      embed.setTitle("Erreur").setDescription("```\n" + consoleText.slice(0, 3900) + "\n```");
    } else if (payload && typeof payload === "object") {
      const { title, desc, fields } = payload;
      consoleText = title ? `${title}: ${desc ?? ""}` : (desc ?? JSON.stringify(payload));
      if (title) embed.setTitle(title);
      if (desc)  embed.setDescription(desc);
      if (Array.isArray(fields) && fields.length) embed.addFields(fields);
    } else {
      consoleText = String(payload);
      embed.setDescription(consoleText);
    }

    // Console
    try {
      if (kind === "error") console.error(consoleText);
      else if (kind === "warn") console.warn(consoleText);
      else console.log(consoleText);
    } catch {}

    // Discord (best-effort)
    if (chan) {
      try {
        await chan.send({ embeds: [embed] });
      } catch {
        // ne casse jamais l'app
      }
    }
  }

  return {
    info: (x) => send("info", x),
    warn: (x) => send("warn", x),
    error: (x) => send("error", x),
  };
}

/**
 * Helper rétro-compat (info). Évite de casser l'ancien code.
 * Usage: logToDiscord("message")
 */
export async function logToDiscord(msg) {
  const logger = makeLogger(_client);
  await logger.info(msg);
}
