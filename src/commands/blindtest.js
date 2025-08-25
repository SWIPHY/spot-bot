import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('blindtest').setDescription('(stub) Lance un blindtest');
export async function execute(interaction) { return interaction.reply('🎵 (stub) Blindtest à venir'); }