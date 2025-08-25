import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('shuffle').setDescription('(stub) Mélange la file');
export async function execute(interaction/*, ctx */) { return interaction.reply('🔀 (stub) Shuffle'); }