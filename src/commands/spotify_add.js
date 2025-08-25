import { SlashCommandBuilder } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_add")
  .setDescription("Ajoute le morceau en cours à la playlist partagée")
  .addStringOption(o =>
    o.setName("playlist")
     .setDescription("ID de playlist Spotify (optionnel, sinon ENV)")
     .setRequired(false)
  );

function getTargetPlaylist(interaction) {
  const fromOption = interaction.options.getString("playlist");
  const fromEnv = process.env.SPOTIFY_SHARED_PLAYLIST_ID;
  return fromOption || fromEnv || null;
}

export async function execute(interaction) {
  const userId = interaction.user.id;

  const playlistId = getTargetPlaylist(interaction);
  if (!playlistId) {
    return interaction.reply({
      content:
        "❌ Pas de playlist cible.\n" +
        "→ Donne l’ID avec `/spotify_add playlist:<id>` **ou** configure `SPOTIFY_SHARED_PLAYLIST_ID` sur Railway.",
      ephemeral: true,
    });
  }

  if (!hasUser(userId)) {
    return interaction.reply({
      content: "❌ Pas de Spotify lié. Fais d’abord `/spotify_link`.",
      ephemeral: true,
    });
  }

  try {
    const { call } = createClientFor(userId);

    // 1) Récupérer la lecture en cours
    const pb = await call("getMyCurrentPlaybackState");
    const item = pb.body?.item;
    if (!item) {
      return interaction.reply({ content: "⏹️ Rien en cours de lecture.", ephemeral: true });
    }

    const trackUri = item.uri; // ex: spotify:track:xxxxx
    const title = item.name;
    const artists = (item.artists || []).map(a => a.name).join(", ");

    // 2) Ajouter dans la playlist
    await call("addTracksToPlaylist", playlistId, [trackUri]);

    // 3) Répondre
    return interaction.reply({
      content: `✅ Ajouté à la playlist **${playlistId}** : **${title}** — ${artists}`,
      ephemeral: true,
    });
  } catch (e) {
    console.error("spotify_add error:", e?.body || e);
    const msg =
      e?.statusCode === 403
        ? "❌ Pas les droits sur la playlist (ou scopes manquants). Refais `/spotify_link`."
        : e?.body?.error?.message
          ? `❌ Spotify API: ${e.body.error.message}`
          : `❌ Erreur inattendue: ${JSON.stringify(e)}`;
    return interaction.reply({ content: msg, ephemeral: true });
  }

}