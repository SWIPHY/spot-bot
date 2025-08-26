import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("Passe au morceau suivant");

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guild.id);
  if (!state) return interaction.reply("❌ File vide.");
  await state.player.skip();
  return interaction.reply("⏭️ Skip.");
}
