import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('spotify_now')
  .setDescription('(WIP) Montre la musique en cours sur Spotify');

export async function execute(interaction) {
  return interaction.reply({ content: '🎧 Bientôt: récupération du currently playing via les tokens stockés.', ephemeral: true });
}