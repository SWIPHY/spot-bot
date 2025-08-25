import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('spotify_link')
  .setDescription('Connecte ton compte Spotify');

export async function execute(interaction) {
  const base = process.env.SPOTIFY_REDIRECT_URL;
  if (!base) return interaction.reply({ content: '❌ SPOTIFY_REDIRECT_URL manquant sur le serveur.', ephemeral: true });
  const url = `${base}/link?user=${interaction.user.id}`;
  return interaction.reply({ content: `🔗 Autorise ici : ${url}`, ephemeral: true });
} 