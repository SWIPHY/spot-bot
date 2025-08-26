import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("resume")
  .setDescription("Reprend la lecture");

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guild.id);
  if (!state) return interaction.reply("❌ Rien à reprendre.");
  state.player.resume();
  return interaction.reply("▶️ Resume.");
}
