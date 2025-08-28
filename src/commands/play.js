import { SlashCommandBuilder } from "discord.js";
import { logToDiscord } from "../util/logger.js";
import { resolveTrack } from "../util/track-resolver.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Joue une musique depuis YouTube")
  .addStringOption(o =>
    o.setName("query")
     .setDescription("Lien YouTube ou recherche")
     .setRequired(true)
  );

export async function execute(interaction, ctx) {
  const query = interaction.options.getString("query");
  const voiceChannel = interaction.member?.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({ content: "❌ Tu dois être dans un salon vocal.", ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const track = await resolveTrack(query);
    if (!track) {
      await interaction.editReply("❌ Rien trouvé pour ta recherche.");
      return;
    }

    const status = await ctx.player.addAndPlay(track, voiceChannel);

    await interaction.editReply({
      content: `${status === "started" ? "▶️ Lecture" : "➕ Ajouté"} : ${track.title} (${track.url})`
    });

    logToDiscord(`🎵 /play -> ${track.title} (${track.url})`);
  } catch (e) {
    console.error("Erreur /play:", e);
    logToDiscord(`❌ Erreur /play: ${e.message}`);
    await interaction.editReply("❌ Oups, erreur interne.");
  }
}
