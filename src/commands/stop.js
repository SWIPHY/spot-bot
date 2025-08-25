import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('stop').setDescription('(stub) Stop la musique');
export async function execute(interaction/*, ctx */) { return interaction.reply('⏹️ (stub) Stop'); }