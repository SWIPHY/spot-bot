import { guardDJ } from '../util/permissions.js';

export const data = { 
  name: 'shuffle', 
  description: 'Mélange la queue' 
};

export async function execute(interaction, ctx) {
  try { 
    guardDJ(interaction); 
  } 
  catch { 
    return interaction.reply({ content: '🔒 Réservé au rôle DJ.', ephemeral: true }); 
  }
  const state = ctx.states.get(interaction.guildId);
  if (!state) return interaction.reply('Queue vide.');
  state.queue.shuffle();
  return interaction.reply('🔀 Queue mélangée.');
}
