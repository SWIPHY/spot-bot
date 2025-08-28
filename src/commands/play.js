import { SlashCommandBuilder } from "discord.js";
import play from "play-dl";
import { logToDiscord } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Joue une musique (URL YouTube ou recherche texte)")
  .addStringOption(o =>
    o.setName("query")
     .setDescription("URL YouTube ou mots-clés")
     .setRequired(true)
  );

export async function execute(interaction, ctx) {
  // sécurité + UX
  const query = interaction.options.getString("query", true);
  const vc = interaction.member?.voice?.channel;
  if (!vc) {
    return interaction.reply({ content: "❌ Rejoins un salon vocal d’abord.", ephemeral: true });
  }

  await interaction.deferReply(); // évite le timeout Discord

  // récupère/crée l’état du serveur (queue + player)
  let state = ctx.states.get(interaction.guildId);
  if (!state) {
    state = ctx.createGuildState(interaction.guild, interaction.channel);
    ctx.states.set(interaction.guildId, state);
  }

  try {
    // ————— Résolution du morceau —————
    let url = null;
    let title = null;

    // si l'user colle une URL YouTube valide
    if (play.yt_validate(query) === "video") {
      const info = await play.video_info(query);
      url = info.video_details.url;
      title = info.video_details.title;
    } else {
      // sinon on cherche sur YouTube
      const results = await play.search(query, {
        limit: 1,
        source: { youtube: "video" },
      });
      if (results.length === 0) {
        return interaction.editReply("❌ Rien trouvé pour ta recherche.");
      }
      url = results[0].url;
      title = results[0].title;
    }

    // track minimal (player.js n’a besoin que de ça)
    const track = { title, url };

    // ajoute et lance
    const res = await state.player.addAndPlay(track, vc);
    if (res === "started") {
      await interaction.editReply(`▶️ **Je joue :** ${title}\n${url}`);
    } else {
      await interaction.editReply(`➕ **Ajouté à la file :** ${title}`);
    }

    logToDiscord(`🎧 /play -> ${title} (${url})`);
  } catch (e) {
    console.error("play command error:", e);
    logToDiscord(`❌ Erreur interaction: ${e?.message || e}`);
    try {
      await interaction.editReply("❌ Oups, erreur interne.");
    } catch {}
  }
}
