import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('skip').setDescription('(stub) Passe au suivant');
export async function execute(interaction/*, ctx */) { return interaction.reply('⏭️ (stub) Skip'); }