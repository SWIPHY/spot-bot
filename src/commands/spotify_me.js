import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('spotify_me')
  .setDescription('(WIP) Affiche les infos de ton compte Spotify connecté');

export async function execute(interaction) {
  return interaction.reply({ content: 'ℹ️ Fonction à brancher après stockage des tokens par utilisateur.', ephemeral: true });
}