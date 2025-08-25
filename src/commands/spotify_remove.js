import { SlashCommandBuilder } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_remove")
  .setDescription("Retire un titre de la playlist par index ou URL")
  .addIntegerOption(o => o.setName("index").setDescription("Position du titre (1..n)").setMinValue(1))
  .addStringOption(o => o.setName("url").setDescription("URL du titre à retirer"));

function extractTrackUri(url) {
  if (!url) return null;
  const m = url.match(/track\/([a-zA-Z0-9]+)/);
  return m ? `spotify:track:${m[1]}` : null;
}

export async function execute(interaction) {
  const uid = interaction.user.id;
  if (!hasUser(uid)) return interaction.reply({ content: "❌ Pas de Spotify lié. Fais `/spotify_link`." });

  const playlistId = process.env.SPOTIFY_SHARED_PLAYLIST_ID;
  if (!playlistId) return interaction.reply({ content: "❌ Configure `SPOTIFY_SHARED_PLAYLIST_ID` sur Railway." });

  const idx = interaction.options.getInteger("index");
  const url = interaction.options.getString("url");

  if (!idx && !url) {
    return interaction.reply({ content: "❌ Donne `index` **ou** `url`." });
  }

  try {
    const { call } = createClientFor(uid);

    if (url) {
      const uri = extractTrackUri(url);
      if (!uri) return interaction.reply({ content: "❌ URL invalide." });
      await call("removeTracksFromPlaylist", playlistId, [{ uri }]);
      return interaction.reply({ content: `🗑️ Retiré : ${url}` });
    }

    // par index: trouve l'item exact
    const info = await call("getPlaylist", playlistId, { fields: "tracks.total" });
    const total = info.body.tracks?.total ?? 0;
    if (idx < 1 || idx > total) return interaction.reply({ content: `❌ Index hors limite (1..${total}).` });

    // API Spotify indexe dès 0; on récupère juste l'item ciblé
    const off = idx - 1;
    const page = await call("getPlaylistTracks", playlistId, { limit: 1, offset: off });
    const it = page.body.items?.[0]?.track;
    if (!it) return interaction.reply({ content: "❌ Titre introuvable." });

    await call("removeTracksFromPlaylistByPosition", playlistId, [off], it.uri);
    return interaction.reply({ content: `🗑️ Retiré #${idx} : ${it.name} — ${it.artists?.map(a => a.name).join(", ")}` });
  } catch (e) {
    console.error("spotify_remove error:", e?.body || e);
    const msg = e?.body?.error?.message || "❌ Échec de suppression (check logs).";
    return interaction.reply({ content: msg });
  }
}
