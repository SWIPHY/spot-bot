import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('spotify_add')
  .setDescription('(WIP) Ajoute le titre courant à ta playlist partagée');

export async function execute(interaction) {
  return interaction.reply({ content: '➕ À implémenter une fois les tokens par user persistés.', ephemeral: true });
}