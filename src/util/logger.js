import { EmbedBuilder } from "discord.js";

const LEVEL_EMOJI = {
  INFO: "🟢",
  WARN: "🟡",
  ERROR: "❌",
  LOG: "🟦"
};

export async function logToDiscord(client, level, message, error) {
  try {
    const chId = process.env.LOG_CHANNEL_ID;
    const emoji = LEVEL_EMOJI[level] ?? "🟦";

    // Console
    if (error) {
      console.error(`[${level}] ${message}\n`, error);
    } else {
      const fn = level === "WARN" ? console.warn : console.log;
      fn(`[${level}] ${message}`);
    }

    if (!client || !chId) return;

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch) return;

    const emb = new EmbedBuilder()
      .setColor(level === "ERROR" ? 0xed4245 : level === "WARN" ? 0xfee75c : 0x57f287)
      .setAuthor({ name: "LOG" })
      .setDescription(`**${emoji} ${level}**\n${message}`)
      .setTimestamp(Date.now());

    if (error) {
      const block =
        "```\n" +
        (error?.stack || error?.message || String(error)).slice(0, 3800) +
        "\n```";
      emb.addFields({ name: "Stack", value: block });
    }

    await ch.send({ embeds: [emb] });
  } catch {
    /* ne casse jamais le bot sur un log */
  }
}
