import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('queue').setDescription('(stub) Affiche la file d\'attente');
export async function execute(interaction/*, ctx */) { return interaction.reply('📜 (stub) Queue vide'); }