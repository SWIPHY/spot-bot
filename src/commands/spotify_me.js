import { SlashCommandBuilder } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_me")
  .setDescription("Infos de ton compte Spotify connecté");

export async function execute(interaction) {
  const userId = interaction.user.id;
  if (!hasUser(userId)) {
    return interaction.reply({ content: "❌ Pas de Spotify lié. Fais `/spotify_link` d’abord.", ephemeral: true });
  }

  try {
    const { call } = createClientFor(userId);
    const me = await call("getMe");
    const name = me.body.display_name || me.body.id;
    const followers = me.body.followers?.total ?? 0;
    const product = me.body.product || "free/unknown";
    return interaction.reply({ content: `👤 **${name}** — ${followers} followers — plan: ${product}`, ephemeral: true });
  } catch (e) {
    console.error(e);
    return interaction.reply({ content: "❌ Impossible de récupérer ton profil Spotify.", ephemeral: true });
  }
}
