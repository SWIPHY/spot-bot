import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('resume').setDescription('(stub) Reprend la lecture');
export async function execute(interaction/*, ctx */) { return interaction.reply('▶️ (stub) Resume'); }