import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_playlist")
  .setDescription("Parcourir la playlist partagée (5 par page)")
  .addBooleanOption(o => o.setName("prive").setDescription("Répondre en privé (par défaut: non)"));

const PAGE_SIZE = 5;
const fmt = n => new Intl.NumberFormat("fr-FR").format(n);

async function pageEmbed(apiCall, playlistId, offset) {
  const info = await apiCall("getPlaylist", playlistId, { fields: "name,images,tracks.total" });
  const total = info.body.tracks?.total ?? 0;
  const tracks = await apiCall("getPlaylistTracks", playlistId, { limit: PAGE_SIZE, offset });

  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle(info.body.name || "Playlist")
    .setURL(`https://open.spotify.com/playlist/${playlistId}`)
    .setFooter({ text: `Page ${Math.floor(offset / PAGE_SIZE) + 1} • ${fmt(total)} titres` })
    .setTimestamp(new Date());

  if (info.body.images?.[0]?.url) embed.setThumbnail(info.body.images[0].url);

  tracks.body.items?.forEach((t, i) => {
    const tr = t.track; if (!tr) return;
    const artists = (tr.artists || []).map(a => a.name).join(", ");
    embed.addFields({ name: `${offset + i + 1}. ${tr.name}`, value: `${artists} • [Écouter](${tr.external_urls?.spotify})` });
  });

  const prevOff = Math.max(0, offset - PAGE_SIZE);
  const nextOff = Math.min(Math.max(0, total - PAGE_SIZE), offset + PAGE_SIZE);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pl_prev_${playlistId}_${prevOff}`).setLabel("◀️ Précédent").setStyle(ButtonStyle.Secondary).setDisabled(offset === 0),
    new ButtonBuilder().setCustomId(`pl_next_${playlistId}_${nextOff}`).setLabel("Suivant ▶️").setStyle(ButtonStyle.Secondary).setDisabled(offset + PAGE_SIZE >= total),
    new ButtonBuilder().setLabel("Ouvrir dans Spotify").setStyle(ButtonStyle.Link).setURL(`https://open.spotify.com/playlist/${playlistId}`),
  );

  return { embed, row };
}

export async function execute(interaction) {
  const ephemeral = interaction.options.getBoolean("prive") ?? false;
  const uid = interaction.user.id;
  if (!hasUser(uid)) return interaction.reply({ content: "❌ Pas de Spotify lié. Fais `/spotify_link`.", ephemeral });

  const playlistId = process.env.SPOTIFY_SHARED_PLAYLIST_ID;
  if (!playlistId) return interaction.reply({ content: "❌ Configure `SPOTIFY_SHARED_PLAYLIST_ID` sur Railway.", ephemeral });

  try {
    const { call } = createClientFor(uid);
    const { embed, row } = await pageEmbed(call, playlistId, 0);
    return interaction.reply({ embeds: [embed], components: [row], ephemeral });
  } catch (e) {
    console.error("spotify_playlist error:", e?.body || e);
    return interaction.reply({ content: "❌ Impossible de charger la playlist.", ephemeral });
  }
}

// Button handler (dans le même module pour simplicité)
export async function onButton(interaction) {
  if (!interaction.customId?.startsWith("pl_")) return false;
  const [ , dir, playlistId, offStr ] = interaction.customId.split("_");
  const offset = Number(offStr) || 0;

  try {
    const { call } = createClientFor(interaction.user.id);
    const { embed, row } = await pageEmbed(call, playlistId, offset);
    await interaction.update({ embeds: [embed], components: [row] });
  } catch (e) {
    console.error("spotify_playlist button error:", e?.body || e);
    await interaction.update({ content: "❌ Erreur de pagination.", components: [] });
  }
  return true;
}
