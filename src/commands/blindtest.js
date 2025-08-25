import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import lyricsFinder from "lyrics-finder";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("lyrics")
  .setDescription("Paroles du titre en cours (si dispo)")
  .addBooleanOption(o => o.setName("prive").setDescription("Répondre en privé (par défaut: non)"));

export async function execute(interaction) {
  const ephemeral = interaction.options.getBoolean("prive") ?? false;
  const uid = interaction.user.id;
  if (!hasUser(uid)) return interaction.reply({ content: "❌ Pas de Spotify lié. Fais `/spotify_link`.", ephemeral });

  try {
    const { call } = createClientFor(uid);
    const resp = await call("getMyCurrentPlaybackState");
    const item = resp.body?.item;
    if (!item || item.type !== "track") return interaction.reply({ content: "⏹️ Pas de morceau en cours.", ephemeral });

    const title = item.name;
    const artist = item.artists?.[0]?.name || "";
    const lyrics = await lyricsFinder(artist, title);

    if (!lyrics) return interaction.reply({ content: `❌ Paroles introuvables pour **${title}**.`, ephemeral });

    const chunk = lyrics.length > 3800 ? lyrics.slice(0, 3800) + "\n…" : lyrics;
    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle(`🎤 ${title}`)
      .setDescription(chunk)
      .setFooter({ text: artist })
      .setTimestamp(new Date());

    return interaction.reply({ embeds: [embed], ephemeral });
  } catch (e) {
    console.error("lyrics error:", e?.body || e);
    return interaction.reply({ content: "❌ Impossible de récupérer les paroles.", ephemeral });
  }
}
