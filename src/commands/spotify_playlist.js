import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_playlist")
  .setDescription("Montre les 5 derniers morceaux de ta playlist partagée")
  .addBooleanOption(o =>
    o.setName("prive").setDescription("Répondre en privé (par défaut: non)")
  );

export async function execute(interaction) {
  const ephemeral = interaction.options.getBoolean("prive") ?? false;
  const userId = interaction.user.id;

  if (!hasUser(userId)) {
    return interaction.reply({
      content: "❌ Pas de Spotify lié. Fais `/spotify_link` d’abord.",
      ephemeral,
    });
  }

  const playlistId = process.env.SPOTIFY_SHARED_PLAYLIST_ID;
  if (!playlistId) {
    return interaction.reply({
      content: "❌ Pas de playlist partagée configurée (`SPOTIFY_SHARED_PLAYLIST_ID`).",
      ephemeral,
    });
  }

  try {
    const { call } = createClientFor(userId);
    const resp = await call("getPlaylistTracks", playlistId, { limit: 5, offset: 0 });

    if (!resp.body?.items?.length) {
      return interaction.reply({ content: "⚠️ Playlist vide.", ephemeral });
    }

    const tracks = resp.body.items;
    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle("🎶 Derniers ajouts à la playlist")
      .setURL(`https://open.spotify.com/playlist/${playlistId}`)
      .setFooter({ text: "Spot Bot" })
      .setTimestamp(new Date());

    for (const t of tracks) {
      const track = t.track;
      if (!track) continue;
      const artists = (track.artists || []).map(a => a.name).join(", ");
      embed.addFields({
        name: track.name,
        value: `${artists} • [Écouter](${track.external_urls?.spotify})`,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral });
  } catch (e) {
    console.error("spotify_playlist error:", e?.body || e);
    return interaction.reply({
      content: "❌ Impossible de charger la playlist (check logs).",
      ephemeral,
    });
  }
}
