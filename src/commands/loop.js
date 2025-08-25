import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('loop').setDescription('(stub) Active/désactive la boucle');
export async function execute(interaction/*, ctx */) { return interaction.reply('🔁 (stub) Loop toggled'); }