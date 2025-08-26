import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stop et nettoie la file");

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guild.id);
  if (!state) return interaction.reply("ℹ️ Déjà arrêté.");
  state.player.stop();
  states.delete(interaction.guild.id);
  return interaction.reply("⏹️ Stop.");
}
