import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('pause').setDescription('(stub) Met en pause');
export async function execute(interaction/*, ctx */) { return interaction.reply('⏸️ (stub) Pause'); }