import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('(stub) Joue une musique par URL ou recherche')
    .addStringOption(o => o.setName('query').setDescription('URL ou recherche').setRequired(true));

export async function execute(interaction/*, ctx */) {
    const q = interaction.options.getString('query', true);
    // Brancher ici ta vraie logique (ytdl/spotify/etc.)
    return interaction.reply(`▶️ (stub) Je jouerais: **${q}**`);
}