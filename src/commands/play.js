import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { resolveTrack } from "../util/search.js";
import { logToDiscord } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Lire un morceau depuis un mot-clé ou une URL YouTube")
  .addStringOption((o) =>
    o
      .setName("query")
      .setDescription("Mot-clé ou URL YouTube")
      .setRequired(true)
  );

export async function execute(interaction, ctx) {
  const query = interaction.options.getString("query", true);

  // Trouver / créer l'état et le player
  const guild = interaction.guild;
  const me = guild.members.me;
  const member = await guild.members.fetch(interaction.user.id);

  const voice = member.voice?.channel;
  if (!voice) {
    return interaction.reply({
      content: "❌ Tu dois être dans un salon vocal.",
      ephemeral: true,
    });
  }
  if (
    !voice
      .permissionsFor(me)
      .has([
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ViewChannel,
      ])
  ) {
    return interaction.reply({
      content: "❌ Je n'ai pas les permissions pour parler/rejoindre ce salon.",
      ephemeral: true,
    });
  }

  await interaction.deferReply(); // évite le timeout même si la recherche prend un peu

  // State par serveur
  const state =
    ctx.states.get(guild.id) ||
    ctx.createGuildState(guild, interaction.channel);

  try {
    // Résolution SANS appeler play.video_info (évite captcha)
    const track = await resolveTrack(query);

    // Ajout + éventuellement démarrage
    const status = await state.player.addAndPlay(track, voice);
    const msg =
      status === "started"
        ? `▶️ **Je joue**: ${track.title}`
        : `➕ **Ajouté à la file**: ${track.title}`;
    await interaction.editReply(msg);
    logToDiscord(`/play -> ${track.title} (${track.url})`);
  } catch (e) {
    if (e?.code === "NO_RESULTS") {
      await interaction.editReply("❌ Rien trouvé pour ta recherche.");
    } else {
      await interaction.editReply(
        "❌ Oups, erreur pendant la résolution du titre (check logs)."
      );
      logToDiscord(`❌ Erreur /play: ${e?.message || e}`);
    }
  }
}
