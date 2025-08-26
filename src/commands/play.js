import { SlashCommandBuilder } from "discord.js";
import { resolveTrack } from "../util/search.js";
import { logToDiscord } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Joue une musique (YouTube URL ou recherche)")
  .addStringOption(o =>
    o.setName("query").setDescription("URL ou recherche").setRequired(true)
  );

export async function execute(interaction, { states, createGuildState }) {
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voice = member.voice.channel;
  if (!voice) return interaction.reply("❌ Rejoins un salon vocal d’abord.");

  const me = await interaction.guild.members.fetchMe();
  const perms = voice.permissionsFor(me);
  if (!perms?.has("Connect") || !perms?.has("Speak")) {
    return interaction.reply("⛔ Il me manque les permissions **Connect**/**Speak** dans ce vocal.");
  }

  const query = interaction.options.getString("query", true);
  await interaction.deferReply();

  const track = await resolveTrack(query);
  if (!track) return interaction.editReply("❌ Rien trouvé pour ta recherche.");

  logToDiscord(`🎧 /play -> ${track.title} (${track.url})`);

  const state = states.get(interaction.guild.id) || createGuildState();
  const { player } = state;

  const res = await player.addAndPlay(
    { ...track, requestedBy: interaction.user.tag },
    voice
  );

  if (res === "started") {
    return interaction.editReply(`▶️ **${track.title}** (demandé par ${interaction.user.tag})`);
  } else {
    return interaction.editReply(`➕ Ajouté à la file: **${track.title}**`);
  }
}
