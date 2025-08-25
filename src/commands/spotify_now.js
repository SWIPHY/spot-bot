import { SlashCommandBuilder } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_now")
  .setDescription("Montre la musique en cours sur ton Spotify");

export async function execute(interaction) {
  const userId = interaction.user.id;
  if (!hasUser(userId)) {
    return interaction.reply({ content: "❌ Pas de Spotify lié. Fais `/spotify_link` d’abord.", ephemeral: true });
  }

  try {
    const { call } = createClientFor(userId);
    const resp = await call("getMyCurrentPlaybackState");
    const item = resp.body?.item;
    if (!item) return interaction.reply({ content: "⏹️ Rien en cours de lecture.", ephemeral: true });

    const title = item.name;
    const artists = (item.artists || []).map(a => a.name).join(", ");
    const url = item.external_urls?.spotify || "https://open.spotify.com/";
    return interaction.reply({ content: `🎧 **${title}** — ${artists}\n${url}`, ephemeral: true });
  } catch (e) {
    console.error(e);
    return interaction.reply({ content: "❌ Impossible de lire l’état de lecture.", ephemeral: true });
  }
}
