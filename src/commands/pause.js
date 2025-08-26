import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("pause")
  .setDescription("Met en pause");

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guild.id);
  if (!state) return interaction.reply("❌ Rien à mettre en pause.");
  state.player.pause();
  return interaction.reply("⏸️ Pause.");
}
