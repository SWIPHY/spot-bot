import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_now")
  .setDescription("Affiche le titre en cours de lecture (embed)")
  .addBooleanOption(o =>
    o.setName("prive").setDescription("Répondre en privé (par défaut: non)")
  );

function mmss(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function execute(interaction) {
  const ephemeral = interaction.options.getBoolean("prive") ?? false;
  const userId = interaction.user.id;

  if (!hasUser(userId)) {
    return interaction.reply({
      content: "❌ Pas de Spotify lié. Fais d’abord `/spotify_link`.",
      ephemeral,
    });
  }

  try {
    const { call } = createClientFor(userId);
    const resp = await call("getMyCurrentPlaybackState");

    const item = resp.body?.item;
    const isPlaying = Boolean(resp.body?.is_playing);
    const device = resp.body?.device?.name || "—";

    if (!item) {
      return interaction.reply({
        content: "⏹️ Rien en cours de lecture.",
        ephemeral,
      });
    }
    if (item.type !== "track") {
      return interaction.reply({
        content: "🎙️ Tu écoutes un podcast/episode (ajout/preview non supportés ici).",
        ephemeral,
      });
    }

    const title = item.name;
    const artists = (item.artists || []).map(a => a.name).join(", ");
    const album = item.album?.name || "—";
    const cover = item.album?.images?.[0]?.url || null;
    const url = item.external_urls?.spotify || "https://open.spotify.com/";
    const progress = resp.body?.progress_ms ?? 0;
    const duration = item.duration_ms ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setAuthor({ name: "Spotify — Now Playing", url })
      .setTitle(title)
      .setURL(url)
      .setDescription(`👤 **${artists}**\n💿 *${album}*`)
      .setThumbnail(cover)
      .addFields(
        { name: "⏳ Progression", value: `${mmss(progress)} / ${mmss(duration)}`, inline: true },
        { name: "🟢 Lecture", value: isPlaying ? "En cours" : "En pause", inline: true },
        { name: "🎧 Appareil", value: device, inline: true },
      )
      .setFooter({ text: "Spot Bot" })
      .setTimestamp(new Date());

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Ouvrir dans Spotify")
        .setStyle(ButtonStyle.Link)
        .setURL(url)
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral });
  } catch (e) {
    console.error(e);
    return interaction.reply({
      content: "❌ Impossible de récupérer la lecture actuelle.",
      ephemeral,
    });
  }
}
