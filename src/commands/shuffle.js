import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("shuffle")
  .setDescription("Mélange la file");

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guild.id);
  if (!state || state.queue.items.length < 2) return interaction.reply("🤷 Rien à mélanger.");
  state.queue.shuffle();
  return interaction.reply("🔀 File mélangée.");
}
