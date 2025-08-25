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
  .setName("spotify_add")
  .setDescription("Ajoute le morceau en cours à une playlist puis montre un aperçu")
  .addStringOption(o =>
    o.setName("playlist")
     .setDescription("ID ou URL de la playlist (sinon var ENV)")
     .setRequired(false)
  )
  .addBooleanOption(o =>
    o.setName("prive").setDescription("Répondre en privé (par défaut: non)")
  );

function extractPlaylistId(input) {
  if (!input) return null;
  const m = input.match(/playlist\/([a-zA-Z0-9]+)/); // URL → ID
  if (m) return m[1];
  if (/^[a-zA-Z0-9]+$/.test(input)) return input;    // ID brut
  return null;
}
function resolvePlaylistId(interaction) {
  const raw = interaction.options.getString("playlist") || process.env.SPOTIFY_SHARED_PLAYLIST_ID || "";
  return extractPlaylistId(raw);
}
const fmt = n => new Intl.NumberFormat("fr-FR").format(n);

export async function execute(interaction) {
  const ephemeral = interaction.options.getBoolean("prive") ?? false;
  const userId = interaction.user.id;

  const playlistId = resolvePlaylistId(interaction);
  if (!playlistId) {
    return interaction.reply({
      content:
        "❌ Donne **l’ID ou l’URL** de la playlist (`/spotify_add playlist:<id|url>`) **ou** configure `SPOTIFY_SHARED_PLAYLIST_ID`.",
      ephemeral,
    });
  }
  if (!hasUser(userId)) {
    return interaction.reply({ content: "❌ Pas de Spotify lié. Fais d’abord `/spotify_link`.", ephemeral });
  }

  try {
    const { call } = createClientFor(userId);

    // 1) what’s playing
    const pb = await call("getMyCurrentPlaybackState");
    const item = pb.body?.item;
    if (!item) return interaction.reply({ content: "⏹️ Rien en cours de lecture.", ephemeral });
    if (item.type !== "track") {
      return interaction.reply({ content: "🎙️ Ce n’est pas un morceau (podcast/episode non supporté).", ephemeral });
    }

    const trackUri = item.uri;
    const title = item.name;
    const artists = (item.artists || []).map(a => a.name).join(", ");
    const cover = item.album?.images?.[0]?.url || null;
    const trackUrl = item.external_urls?.spotify || "https://open.spotify.com/";
    const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;

    // 2) add to playlist
    await call("addTracksToPlaylist", playlistId, [trackUri]);

    // 3) fetch a small preview (latest 5)
    // Spotify renvoie les plus anciens d’abord → on prend la fin pour “derniers ajouts”
    const info = await call("getPlaylist", playlistId, { fields: "name,tracks.total,images" });
    const total = info.body.tracks?.total ?? 0;
    const offset = Math.max(0, total - 5);
    const last = await call("getPlaylistTracks", playlistId, { limit: 5, offset });
    const items = (last.body?.items || []).filter(t => t?.track);

    const previewLines = items
      .map((t, i) => {
        const tr = t.track;
        const a = (tr.artists || []).map(a => a.name).join(", ");
        return `**${i + 1 + offset}.** ${tr.name} — ${a}`;
      })
      .join("\n");

    // 4) embed + boutons
    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setAuthor({ name: "Spotify — Ajouté à la playlist", url: playlistUrl })
      .setTitle(title)
      .setURL(trackUrl)
      .setDescription(`👤 **${artists}**`)
      .setThumbnail(cover)
      .addFields(
        { name: "🎯 Playlist", value: `[${info.body.name}](${playlistUrl})`, inline: true },
        { name: "🎵 Total", value: fmt(total), inline: true },
      )
      .setFooter({ text: "Spot Bot" })
      .setTimestamp(new Date());

    if (previewLines) {
      embed.addFields({ name: "🆕 Derniers ajouts", value: previewLines });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Voir la playlist").setStyle(ButtonStyle.Link).setURL(playlistUrl),
      new ButtonBuilder().setLabel("Ouvrir le titre").setStyle(ButtonStyle.Link).setURL(trackUrl),
    );

    return interaction.reply({ embeds: [embed], components: [row], ephemeral });
  } catch (e) {
    console.error("spotify_add error:", e?.body || e);
    const msg =
      e?.statusCode === 403
        ? "❌ Pas les droits sur la playlist **ou** scopes manquants. Re-fais `/spotify_link`."
        : e?.body?.error?.message
          ? `❌ Spotify API: ${e.body.error.message}`
          : "❌ Impossible d’ajouter le titre (check logs).";
    return interaction.reply({ content: msg, ephemeral });
  }
}
