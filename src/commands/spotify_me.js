import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_me")
  .setDescription("Profil Spotify (joli embed)")
  .addBooleanOption(o =>
    o.setName("prive")
     .setDescription("Répondre en privé (par défaut: non)")
  );

const productLabel = (p) => {
  if (!p) return "inconnu";
  const map = { premium: "Premium", free: "Free", open: "Open" };
  return map[p.toLowerCase?.()] ?? p;
};

export async function execute(interaction) {
  const userId = interaction.user.id;
  const ephemeral = interaction.options.getBoolean("prive") ?? false;

  if (!hasUser(userId)) {
    return interaction.reply({
      content: "❌ Pas de Spotify lié. Fais `/spotify_link` d’abord.",
      ephemeral
    });
  }

  try {
    const { call } = createClientFor(userId);
    const me = await call("getMe");

    const name = me.body.display_name || me.body.id;
    const followers = me.body.followers?.total ?? 0;
    const country = me.body.country || "—";
    const product = productLabel(me.body.product);
    const profileUrl = me.body.external_urls?.spotify || "https://open.spotify.com/";
    const avatar = me.body.images?.[0]?.url;

    const embed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setAuthor({ name: "Spotify — Ton profil", url: profileUrl })
      .setTitle(name)
      .setURL(profileUrl)
      .setThumbnail(avatar ?? null)
      .addFields(
        { name: "👥 Followers", value: new Intl.NumberFormat("fr-FR").format(followers), inline: true },
        { name: "🌍 Pays", value: country, inline: true },
        { name: "💳 Plan", value: product, inline: true }
      )
      .setFooter({ text: "Spot Bot" })
      .setTimestamp(new Date());

    // petit hint si product manquant
    if (!me.body.product) {
      embed.setDescription("ℹ️ Si le plan n’apparaît pas, refais `/spotify_link` après ajout du scope `user-read-email`.");
    }

    return interaction.reply({ embeds: [embed], ephemeral });
  } catch (e) {
    console.error(e);
    return interaction.reply({
      content: "❌ Impossible de récupérer ton profil Spotify.",
      ephemeral
    });
  }
}
