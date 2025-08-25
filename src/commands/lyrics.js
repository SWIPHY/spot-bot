import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('lyrics').setDescription('(stub) Affiche les paroles');
export async function execute(interaction) { return interaction.reply('📖 (stub) Lyrics à venir'); }